-- 023 · Um cadastro só de atleta (fase 2 do profissional com as mesmas abas)
--
-- Pedido do Guilherme em 30/09/2026. O elenco do time profissional passa a
-- sincronizar pelo MESMO caminho da pelada (salvar_jogadores, base única), e
-- não mais pelo upsert próprio do profissional. Para isso:
--
--   1. salvar_jogadores leva também categoria, naipe, altura e peso — as
--      colunas já existiam em players desde o profissional;
--   2. o que o atleta preenche pelo link pessoal (nascimento, altura, peso)
--      passa a contar como edição NOVA (updated_at = agora). Sem isso, a
--      próxima edição do técnico — mais nova pelo relógio do aparelho —
--      apagaria o que o atleta escreveu;
--   3. o jogo ganha o tipo do profissional: amistoso ou campeonato.

-- ── 1. Atletas: os campos do profissional na sincronização ──
create or replace function public.salvar_jogadores(p_group uuid, p_rows jsonb)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not public.can_manage_group(p_group) then
    raise exception 'Sem permissão neste grupo';
  end if;

  insert into public.players as p
    (id, group_id, name, nickname, skills, positions, is_keeper, kind, pending,
     birth_date, phone, age_group, naipe, height_cm, weight_kg,
     active, deleted_at, updated_at)
  select r.id, p_group, r.name, r.nickname,
         coalesce(r.skills, '{}'::jsonb), coalesce(r.positions, '{}'::jsonb),
         coalesce(r.is_keeper, false), coalesce(r.kind, 'mensalista'),
         coalesce(r.pending, false), r.birth_date, r.phone,
         r.age_group, r.naipe, r.height_cm, r.weight_kg,
         r.deleted_at is null, r.deleted_at, r.updated_at
    from jsonb_to_recordset(p_rows) as r(
           id uuid, name text, nickname text, skills jsonb, positions jsonb,
           is_keeper boolean, kind text, pending boolean, birth_date date,
           phone text, age_group text, naipe text, height_cm int, weight_kg numeric,
           deleted_at timestamptz, updated_at timestamptz)
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
    active     = excluded.active,
    deleted_at = excluded.deleted_at,
    updated_at = excluded.updated_at
  where p.group_id = p_group
    and p.updated_at < excluded.updated_at;
end;
$$;
revoke execute on function public.salvar_jogadores(uuid, jsonb) from public, anon;
grant  execute on function public.salvar_jogadores(uuid, jsonb) to authenticated;

-- ── 2. O link pessoal do atleta é uma edição como as outras ──
create or replace function public.guest_update_athlete(
  token text, p_birth date, p_height int, p_weight numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.players
     set birth_date = p_birth,
         height_cm  = p_height,
         weight_kg  = p_weight,
         updated_at = now()
   where invite_token = token and active;
  if not found then
    raise exception 'Link inválido';
  end if;
end;
$$;

-- ── 3. O tipo do jogo do profissional ──
alter table public.events
  add column if not exists competicao text check (competicao in ('amistoso', 'campeonato'));

create or replace function public.salvar_jogos(p_group uuid, p_rows jsonb)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not public.can_manage_group(p_group) then
    raise exception 'Sem permissão neste grupo';
  end if;
  insert into public.events as e
    (id, group_id, title, starts_at, location, slots, sport, status, closed, sorteio, cobra_diaria,
     competicao, updated_at)
  select r.id, p_group, r.title, r.starts_at, r.location, r.slots,
         coalesce(r.sport, (select g.sport from public.groups g where g.id = p_group)),
         coalesce(r.status, 'programado'), coalesce(r.status, 'programado') <> 'programado',
         r.sorteio, coalesce(r.cobra_diaria, true), r.competicao, r.updated_at
    from jsonb_to_recordset(p_rows) as r(
           id uuid, title text, starts_at timestamptz, location text, slots int,
           sport text, status text, sorteio jsonb, cobra_diaria boolean, competicao text,
           updated_at timestamptz)
  on conflict (id) do update set
    title        = excluded.title,
    starts_at    = excluded.starts_at,
    location     = excluded.location,
    slots        = excluded.slots,
    sport        = coalesce(excluded.sport, e.sport),
    status       = excluded.status,
    closed       = excluded.closed,
    sorteio      = excluded.sorteio,
    cobra_diaria = excluded.cobra_diaria,
    competicao   = excluded.competicao,
    updated_at   = excluded.updated_at
  where e.group_id = p_group
    and e.updated_at < excluded.updated_at;
end;
$$;
revoke execute on function public.salvar_jogos(uuid, jsonb) from public, anon;
grant  execute on function public.salvar_jogos(uuid, jsonb) to authenticated;
