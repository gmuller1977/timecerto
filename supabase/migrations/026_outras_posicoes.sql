-- 026 · Mais de uma posição por atleta
--
-- Pedido do Guilherme em 30/09/2026 (docs/telas-profissional.md, "Múltiplas
-- posições"). A posição principal continua em positions.volei — é onde o
-- atleta joga por padrão, e tudo o que já lia a posição segue igual. As
-- outras, em ordem de preferência, ficam em outras_posicoes: é onde ele
-- quebra galho. Na escalação, jogar numa posição que não é a principal vira
-- aviso de improviso, nunca erro.
--
-- salvar_jogadores é recriada com a coluna nova (a mesma da 023, mais ela).

alter table public.players
  add column if not exists outras_posicoes text[] not null default '{}';

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
    and p.updated_at < excluded.updated_at;
end;
$$;
revoke execute on function public.salvar_jogadores(uuid, jsonb) from public, anon;
grant  execute on function public.salvar_jogadores(uuid, jsonb) to authenticated;
