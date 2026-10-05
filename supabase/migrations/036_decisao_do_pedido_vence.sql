-- 036 · Aprovar, juntar e recusar um pedido não dependem do relógio do celular
--
-- Relatado pelo Guilherme em 05/10/2026: ao juntar o pedido de cadastro de um
-- mensalista com o cadastro que já existia, os dois continuavam separados.
--
-- salvar_jogadores decide quem vence pela hora: a linha só é sobrescrita se a
-- que chega for MAIS NOVA. O pedido do link é carimbado com a hora do
-- SERVIDOR; a decisão do administrador, com a do CELULAR. Com o celular um
-- pouco atrasado e a decisão logo depois do cadastro, o banco achava a decisão
-- mais velha e a ignorava em silêncio — o pedido sumia do celular e ficava no
-- banco. Medido: com o celular 1 minuto atrasado, juntar, recusar e aprovar
-- eram todos descartados.
--
-- Agora, enquanto o pedido está pendente, a decisão do administrador vence
-- sempre. Ninguém além dele mexe num pedido depois de criado, então não há
-- edição de outra pessoa para proteger. Cadastro já aprovado segue a regra de
-- sempre: vale a edição mais recente.
--
-- Rodar uma vez no SQL Editor, DEPOIS da 035. Não apaga dados: troca uma
-- função.

create or replace function public.salvar_jogadores(p_group uuid, p_rows jsonb)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not public.can_manage_group(p_group) then
    raise exception 'Sem permissão neste grupo';
  end if;

  insert into public.players as p
    (id, group_id, name, nickname, skills, positions, is_keeper, kind, pending,
     birth_date, phone, age_group, naipe, height_cm, weight_kg, outras_posicoes,
     active, deleted_at, updated_at)
  select r.id, p_group, r.name, r.nickname,
         coalesce(r.skills, '{}'::jsonb), coalesce(r.positions, '{}'::jsonb),
         coalesce(r.is_keeper, false), coalesce(r.kind, 'mensalista'),
         coalesce(r.pending, false), r.birth_date, r.phone,
         r.age_group, r.naipe, r.height_cm, r.weight_kg,
         coalesce(r.outras_posicoes, '{}'::text[]),
         r.deleted_at is null, r.deleted_at, r.updated_at
    from jsonb_to_recordset(p_rows) as r(
           id uuid, name text, nickname text, skills jsonb, positions jsonb,
           is_keeper boolean, kind text, pending boolean, birth_date date,
           phone text, age_group text, naipe text, height_cm int, weight_kg numeric,
           outras_posicoes text[], deleted_at timestamptz, updated_at timestamptz)
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
