-- ─────────────────────────────────────────────────────────────
-- TimeCerto — esquema do banco (fase 2)
-- Rode no SQL Editor do Supabase, de uma vez só.
-- ─────────────────────────────────────────────────────────────

-- ── Perfis ───────────────────────────────────────────────────
-- Espelha auth.users. Criado automaticamente no cadastro.
create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  name        text not null,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Grupos ───────────────────────────────────────────────────
-- Um grupo é a pelada ou o time. É a unidade de compartilhamento.
create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sport       text not null check (sport in ('futebol', 'volei', 'basquete')),
  owner_id    uuid not null references public.profiles on delete cascade,
  -- Código curto para entrar no grupo por link do WhatsApp
  invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
  created_at  timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id   uuid not null references public.groups on delete cascade,
  user_id    uuid not null references public.profiles on delete cascade,
  role       text not null default 'jogador' check (role in ('dono', 'organizador', 'jogador')),
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- ── Jogadores ────────────────────────────────────────────────
-- Nem todo jogador tem conta. O cadastro do grupo é independente
-- do login: user_id é opcional e só liga quando a pessoa entra.
create table if not exists public.players (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups on delete cascade,
  user_id    uuid references public.profiles on delete set null,
  name       text not null,
  -- { "volei": 4, "futebol": 2 } — nível por esporte
  skills     jsonb not null default '{}'::jsonb,
  -- { "volei": "levantador" }
  positions  jsonb not null default '{}'::jsonb,
  is_keeper  boolean not null default false,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists players_group_idx on public.players (group_id);

-- ── Elencos fixos ────────────────────────────────────────────
create table if not exists public.squads (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups on delete cascade,
  name       text not null,
  color      text not null default 'verde',
  system     text,
  is_mine    boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.squad_players (
  squad_id  uuid not null references public.squads on delete cascade,
  player_id uuid not null references public.players on delete cascade,
  primary key (squad_id, player_id)
);

-- ── Partidas ─────────────────────────────────────────────────
create table if not exists public.matches (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups on delete cascade,
  sport      text not null,
  played_at  timestamptz not null default now(),
  -- Foto dos times no dia. Nomes e elencos mudam; o histórico não.
  teams      jsonb not null default '[]'::jsonb,
  attendance uuid[] not null default '{}',
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists matches_group_idx on public.matches (group_id, played_at desc);

-- Um set no vôlei, um jogo no futebol
create table if not exists public.games (
  id       uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches on delete cascade,
  idx      int not null,
  team_a   text not null,
  team_b   text not null,
  score_a  int not null default 0,
  score_b  int not null default 0,
  finished boolean not null default false,
  unique (match_id, idx)
);

-- O scout propriamente dito: um registro por ponto.
-- kind = 'ponto' (mérito de quem marcou) ou 'erro' (falha do adversário).
create table if not exists public.rallies (
  id        uuid primary key default gen_random_uuid(),
  game_id   uuid not null references public.games on delete cascade,
  idx       int not null,
  team_id   text not null,
  kind      text not null check (kind in ('ponto', 'erro')),
  action    text not null,
  player_id uuid references public.players on delete set null,
  score_a   int not null,
  score_b   int not null,
  at        timestamptz not null default now(),
  unique (game_id, idx)
);

create index if not exists rallies_game_idx on public.rallies (game_id);
create index if not exists rallies_player_idx on public.rallies (player_id);

-- ── Financeiro do grupo ──────────────────────────────────────
create table if not exists public.expenses (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups on delete cascade,
  description text not null,
  -- Sempre em centavos. Nunca float para dinheiro.
  amount_cents bigint not null check (amount_cents >= 0),
  spent_on    date not null default current_date,
  paid_by     uuid references public.players on delete set null,
  split_among uuid[] not null default '{}',
  created_at  timestamptz not null default now()
);

create table if not exists public.payments (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups on delete cascade,
  player_id    uuid not null references public.players on delete cascade,
  amount_cents bigint not null check (amount_cents >= 0),
  due_on       date,
  paid_on      date,
  status       text not null default 'pendente' check (status in ('pendente', 'pago', 'atrasado')),
  method       text check (method in ('pix', 'dinheiro', 'transferencia')),
  created_at   timestamptz not null default now()
);

create index if not exists payments_group_idx on public.payments (group_id, status);

-- ─────────────────────────────────────────────────────────────
-- Segurança em nível de linha
-- Sem isto, qualquer pessoa com a chave pública lê o banco inteiro.
-- ─────────────────────────────────────────────────────────────

-- Funções security definer: consultam sem reaplicar RLS e evitam
-- a recursão infinita de uma política sobre group_members que
-- precise consultar group_members.
create or replace function public.is_group_member(gid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid()
  );
$$;

create or replace function public.can_manage_group(gid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid
      and user_id = auth.uid()
      and role in ('dono', 'organizador')
  );
$$;

create or replace function public.match_group(mid uuid)
returns uuid language sql security definer stable set search_path = public as $$
  select group_id from public.matches where id = mid;
$$;

create or replace function public.game_group(gid uuid)
returns uuid language sql security definer stable set search_path = public as $$
  select m.group_id from public.games g
  join public.matches m on m.id = g.match_id
  where g.id = gid;
$$;

alter table public.profiles       enable row level security;
alter table public.groups         enable row level security;
alter table public.group_members  enable row level security;
alter table public.players        enable row level security;
alter table public.squads         enable row level security;
alter table public.squad_players  enable row level security;
alter table public.matches        enable row level security;
alter table public.games          enable row level security;
alter table public.rallies        enable row level security;
alter table public.expenses       enable row level security;
alter table public.payments       enable row level security;

-- Perfis: cada um vê e edita o seu
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
  for select using (id = auth.uid());

drop policy if exists profiles_self_write on public.profiles;
create policy profiles_self_write on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Grupos: membro lê, dono e organizador alteram
drop policy if exists groups_member_read on public.groups;
create policy groups_member_read on public.groups
  for select using (public.is_group_member(id));

drop policy if exists groups_owner_create on public.groups;
create policy groups_owner_create on public.groups
  for insert with check (owner_id = auth.uid());

drop policy if exists groups_manage on public.groups;
create policy groups_manage on public.groups
  for update using (public.can_manage_group(id));

drop policy if exists groups_owner_delete on public.groups;
create policy groups_owner_delete on public.groups
  for delete using (owner_id = auth.uid());

-- Membros
drop policy if exists members_read on public.group_members;
create policy members_read on public.group_members
  for select using (public.is_group_member(group_id));

drop policy if exists members_self_join on public.group_members;
create policy members_self_join on public.group_members
  for insert with check (user_id = auth.uid());

drop policy if exists members_manage on public.group_members;
create policy members_manage on public.group_members
  for all using (public.can_manage_group(group_id));

-- Tabelas do grupo: membro lê, organizador escreve
do $$
declare t text;
begin
  foreach t in array array['players', 'squads', 'matches', 'expenses', 'payments']
  loop
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format(
      'create policy %I_read on public.%I for select using (public.is_group_member(group_id))', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format(
      'create policy %I_write on public.%I for all using (public.can_manage_group(group_id)) with check (public.can_manage_group(group_id))', t, t);
  end loop;
end $$;

-- Sets e rallies herdam a permissão da partida
drop policy if exists games_read on public.games;
create policy games_read on public.games
  for select using (public.is_group_member(public.match_group(match_id)));

drop policy if exists games_write on public.games;
create policy games_write on public.games
  for all using (public.can_manage_group(public.match_group(match_id)))
  with check (public.can_manage_group(public.match_group(match_id)));

drop policy if exists rallies_read on public.rallies;
create policy rallies_read on public.rallies
  for select using (public.is_group_member(public.game_group(game_id)));

drop policy if exists rallies_write on public.rallies;
create policy rallies_write on public.rallies
  for all using (public.can_manage_group(public.game_group(game_id)))
  with check (public.can_manage_group(public.game_group(game_id)));

drop policy if exists squad_players_read on public.squad_players;
create policy squad_players_read on public.squad_players
  for select using (
    exists (select 1 from public.squads s
            where s.id = squad_id and public.is_group_member(s.group_id))
  );

drop policy if exists squad_players_write on public.squad_players;
create policy squad_players_write on public.squad_players
  for all using (
    exists (select 1 from public.squads s
            where s.id = squad_id and public.can_manage_group(s.group_id))
  );

-- Quem cria o grupo vira dono e membro na mesma transação
create or replace function public.handle_new_group()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.group_members (group_id, user_id, role)
  values (new.id, new.owner_id, 'dono')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_group_created on public.groups;
create trigger on_group_created
  after insert on public.groups
  for each row execute function public.handle_new_group();

-- Entrar em um grupo pelo código de convite, sem precisar enxergar
-- a tabela de grupos antes de ser membro.
create or replace function public.join_group(code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  select id into gid from public.groups where invite_code = upper(code);
  if gid is null then
    raise exception 'Código de convite inválido';
  end if;
  insert into public.group_members (group_id, user_id, role)
  values (gid, auth.uid(), 'jogador')
  on conflict do nothing;
  return gid;
end;
$$;
