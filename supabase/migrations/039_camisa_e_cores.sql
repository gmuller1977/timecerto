-- 039 · Número da camisa e cores das posições (modo profissional)
--
-- Pedidos do Guilherme em 08/10/2026, ao testar o profissional em jogo:
--
--   - o número da camisa mora no CADASTRO do atleta (players.numero), para ser
--     sempre o mesmo; na escalação de cada jogo dá para trocar, e a troca vale
--     só para aquela partida (fica nos dados da partida, não aqui);
--   - as cores de cada posição (levantador, oposto, ponteiro, central, líbero)
--     são UMA configuração do time (groups.cores_posicoes): todos os
--     administradores veem as mesmas. Nulo = as cores padrão do app.
--
-- Rodar uma vez no SQL Editor, DEPOIS da 038. Não apaga dados: cria duas
-- colunas, troca salvar_jogadores (agora com o número) e cria uma função.

alter table public.players
  add column if not exists numero smallint check (numero is null or numero between 0 and 99);

alter table public.groups
  add column if not exists cores_posicoes jsonb;

-- O cadastro do atleta passa a levar o número (o resto igual à 036)
create or replace function public.salvar_jogadores(p_group uuid, p_rows jsonb)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not public.can_manage_group(p_group) then
    raise exception 'Sem permissão neste grupo';
  end if;

  insert into public.players as p
    (id, group_id, name, nickname, skills, positions, is_keeper, kind, pending,
     birth_date, phone, age_group, naipe, height_cm, weight_kg, outras_posicoes, numero,
     active, deleted_at, updated_at)
  select r.id, p_group, r.name, r.nickname,
         coalesce(r.skills, '{}'::jsonb), coalesce(r.positions, '{}'::jsonb),
         coalesce(r.is_keeper, false), coalesce(r.kind, 'mensalista'),
         coalesce(r.pending, false), r.birth_date, r.phone,
         r.age_group, r.naipe, r.height_cm, r.weight_kg,
         coalesce(r.outras_posicoes, '{}'::text[]), r.numero,
         r.deleted_at is null, r.deleted_at, r.updated_at
    from jsonb_to_recordset(p_rows) as r(
           id uuid, name text, nickname text, skills jsonb, positions jsonb,
           is_keeper boolean, kind text, pending boolean, birth_date date,
           phone text, age_group text, naipe text, height_cm int, weight_kg numeric,
           outras_posicoes text[], numero smallint, deleted_at timestamptz, updated_at timestamptz)
  on conflict (id) do update set
    name       = excluded.name,
    nickname   = excluded.nickname,
    skills     = excluded.skills,
    positions  = excluded.positions,
    is_keeper  = excluded.is_keeper,
    kind       = excluded.kind,
    pending    = excluded.pending,
    birth_date = excluded.birth_date,
    phone      = excluded.phone,
    age_group  = excluded.age_group,
    naipe      = excluded.naipe,
    height_cm  = excluded.height_cm,
    weight_kg  = excluded.weight_kg,
    outras_posicoes = excluded.outras_posicoes,
    numero     = excluded.numero,
    active     = excluded.active,
    deleted_at = excluded.deleted_at,
    updated_at = excluded.updated_at
  where p.group_id = p_group
    and (p.updated_at < excluded.updated_at
         -- Pedido do link ainda pendente: a decisão do administrador (aprovar,
         -- juntar, recusar) vence sempre, qualquer que seja o relógio do celular
         or (p.pending and (excluded.deleted_at is not null or not excluded.pending)));
end;
$$;

-- ── As cores das posições: quem administra o grupo grava ──
create or replace function public.salvar_cores_posicoes(p_group uuid, p_cores jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare k text; v text;
begin
  if not public.can_manage_group(p_group) then
    raise exception 'Sem permissão neste grupo';
  end if;
  if p_cores is not null then
    if jsonb_typeof(p_cores) <> 'object' then
      raise exception 'Cores inválidas';
    end if;
    for k, v in select key, value #>> '{}' from jsonb_each(p_cores) loop
      if k not in ('levantador', 'oposto', 'ponteiro', 'central', 'libero') or v !~ '^#[0-9A-Fa-f]{6}$' then
        raise exception 'Cores inválidas';
      end if;
    end loop;
  end if;
  update public.groups set cores_posicoes = p_cores where id = p_group;
end;
$$;
revoke execute on function public.salvar_cores_posicoes(uuid, jsonb) from public, anon;
grant  execute on function public.salvar_cores_posicoes(uuid, jsonb) to authenticated;
