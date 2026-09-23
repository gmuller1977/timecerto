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
  -- Login pelo Google: o nome vem em full_name. O perfil nunca fica sem nome
  -- (name é not null, e um insert que falha aqui derruba o login inteiro).
  insert into public.profiles (id, name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Organizador'
    ),
    new.raw_user_meta_data->>'avatar_url'
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
  -- Pelada (amador) ou time com técnico (profissional). São quase dois apps:
  -- o convite, o cadastro e o que o convidado vê mudam com isso.
  mode        text not null default 'amador' check (mode in ('amador', 'profissional')),
  -- Código do link do grupo no WhatsApp. Quem tem o link lê a lista e marca
  -- presença SEM conta — por isso 10 caracteres e não 6: é a única barreira.
  invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
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
  -- ── Só no modo profissional ──
  -- Idade nunca é guardada: sai de birth_date.
  birth_date date,
  age_group  text check (age_group in ('sub13', 'sub15', 'sub17', 'sub19', 'sub21', 'adulto', 'master')),
  naipe      text check (naipe in ('masculino', 'feminino', 'misto')),
  height_cm  int check (height_cm between 80 and 250),
  weight_kg  numeric(4, 1) check (weight_kg between 20 and 250),
  -- Link pessoal do atleta: completa o próprio cadastro sem conta.
  -- 32 caracteres aleatórios — quem tem o link edita os dados dele.
  invite_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  -- Incluído pelo link do grupo (a pessoa se incluiu, ou foi levada por alguém)
  added_via_link boolean not null default false,
  invited_by uuid references public.players on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists players_group_idx on public.players (group_id);

-- ── Jogos marcados e presença ────────────────────────────────
-- A pelada de quinta, o treino de sábado. O convidado responde "vou" ou
-- "não vou" aqui; a partida (matches) só existe depois que o jogo acontece.
create table if not exists public.events (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups on delete cascade,
  title      text,
  starts_at  timestamptz not null,
  -- Fechado = não aceita mais resposta pelo link
  closed     boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists events_group_idx on public.events (group_id, starts_at desc);

create table if not exists public.attendance (
  event_id    uuid not null references public.events on delete cascade,
  player_id   uuid not null references public.players on delete cascade,
  status      text not null check (status in ('vou', 'nao_vou')),
  answered_at timestamptz not null default now(),
  primary key (event_id, player_id)
);

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
alter table public.events         enable row level security;
alter table public.attendance     enable row level security;

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

-- O dono lê o próprio grupo sem depender de ser membro. Necessário no
-- insert ... returning: a leitura é conferida ANTES do gatilho que o torna
-- membro (on_group_created, after insert), e sem isto criar grupo falha.
drop policy if exists groups_owner_read on public.groups;
create policy groups_owner_read on public.groups
  for select using (owner_id = auth.uid());

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

-- Sem política de auto-inserção: ela deixava qualquer usuário logado entrar
-- em qualquer grupo sabendo o id, sem código. Entrar é só por join_group.
drop policy if exists members_self_join on public.group_members;

drop policy if exists members_manage on public.group_members;
create policy members_manage on public.group_members
  for all using (public.can_manage_group(group_id));

-- Tabelas do grupo: membro lê, organizador escreve
do $$
declare t text;
begin
  foreach t in array array['players', 'squads', 'matches', 'expenses', 'payments', 'events']
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

drop policy if exists attendance_read on public.attendance;
create policy attendance_read on public.attendance
  for select using (
    exists (select 1 from public.events e
            where e.id = event_id and public.is_group_member(e.group_id))
  );

drop policy if exists attendance_write on public.attendance;
create policy attendance_write on public.attendance
  for all using (
    exists (select 1 from public.events e
            where e.id = event_id and public.can_manage_group(e.group_id))
  )
  with check (
    exists (select 1 from public.events e
            where e.id = event_id and public.can_manage_group(e.group_id))
  );

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

-- ─────────────────────────────────────────────────────────────
-- Convidado sem conta
--
-- Jogador e atleta não fazem login: entram pelo link do WhatsApp. Eles não
-- passam pela RLS (não têm auth.uid()), então TODO acesso deles é por estas
-- funções security definer, e cada uma confere o código ou o token antes de
-- tocar em qualquer linha. Nenhuma tabela é aberta para `anon`.
--
-- O que o convidado NUNCA recebe: dados de outro atleta além de nome e
-- posição, tokens pessoais, e-mail de ninguém, financeiro.
-- ─────────────────────────────────────────────────────────────

-- Link do grupo (amador): o grupo, o próximo jogo aberto e a lista de
-- jogadores com a resposta de cada um.
create or replace function public.guest_group(code text)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare g public.groups; ev public.events;
begin
  select * into g from public.groups where invite_code = upper(code);
  if g.id is null then
    raise exception 'Convite inválido';
  end if;

  select * into ev from public.events
   where group_id = g.id and not closed
   order by starts_at asc limit 1;

  return jsonb_build_object(
    'group', jsonb_build_object('name', g.name, 'sport', g.sport, 'mode', g.mode),
    'event', case when ev.id is null then null else jsonb_build_object(
      'id', ev.id, 'title', ev.title, 'startsAt', ev.starts_at) end,
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id,
               'name', p.name,
               'position', p.positions ->> g.sport,
               'status', a.status,
               'invitedBy', inv.name)
             order by p.name)
        from public.players p
        left join public.attendance a on a.player_id = p.id and a.event_id = ev.id
        left join public.players inv on inv.id = p.invited_by
       where p.group_id = g.id and p.active
    ), '[]'::jsonb)
  );
end;
$$;

-- "Vou" / "não vou" pelo link do grupo. Confere que o jogador e o jogo são
-- DAQUELE grupo e que o jogo ainda aceita resposta.
create or replace function public.guest_set_attendance(
  code text, p_event uuid, p_player uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  if p_status not in ('vou', 'nao_vou') then
    raise exception 'Resposta inválida';
  end if;
  select id into gid from public.groups where invite_code = upper(code);
  if gid is null then
    raise exception 'Convite inválido';
  end if;
  if not exists (select 1 from public.events
                  where id = p_event and group_id = gid and not closed) then
    raise exception 'Este jogo não aceita mais respostas';
  end if;
  if not exists (select 1 from public.players
                  where id = p_player and group_id = gid and active) then
    raise exception 'Jogador não encontrado neste grupo';
  end if;

  insert into public.attendance (event_id, player_id, status)
  values (p_event, p_player, p_status)
  on conflict (event_id, player_id)
  do update set status = excluded.status, answered_at = now();
end;
$$;

-- Link pessoal do atleta: o cadastro DELE e o nome do time.
create or replace function public.guest_athlete(token text)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare p public.players; g public.groups;
begin
  select * into p from public.players where invite_token = token and active;
  if p.id is null then
    raise exception 'Link inválido';
  end if;
  select * into g from public.groups where id = p.group_id;

  return jsonb_build_object(
    'group', jsonb_build_object('name', g.name, 'sport', g.sport, 'mode', g.mode),
    'athlete', jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'birthDate', p.birth_date,
      'ageGroup', p.age_group,
      'naipe', p.naipe,
      'heightCm', p.height_cm,
      'weightKg', p.weight_kg,
      'position', p.positions ->> 'volei')
  );
end;
$$;

-- O atleta completa o próprio cadastro. Só estes campos: nome, categoria e
-- naipe são decisão do técnico, não do atleta.
create or replace function public.guest_update_athlete(
  token text, p_birth date, p_height int, p_weight numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.players
     set birth_date = p_birth,
         height_cm  = p_height,
         weight_kg  = p_weight
   where invite_token = token and active;
  if not found then
    raise exception 'Link inválido';
  end if;
end;
$$;

-- Partidas do grupo para consulta, por qualquer um dos dois links.
-- As 30 mais recentes com sets e rallies, no formato que o app já usa para
-- calcular estatística — a conta é feita no aparelho, não aqui.
create or replace function public.guest_matches(code text default null, token text default null)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare gid uuid;
begin
  if code is not null then
    select id into gid from public.groups where invite_code = upper(code);
  elsif token is not null then
    select group_id into gid from public.players where invite_token = token and active;
  end if;
  if gid is null then
    raise exception 'Convite inválido';
  end if;

  return coalesce((
    select jsonb_agg(x.m_json order by x.played_at desc)
      from (
        select m.played_at, jsonb_build_object(
          'id', m.id,
          'date', m.played_at,
          'sport', m.sport,
          'teams', m.teams,
          'games', coalesce((
            select jsonb_agg(jsonb_build_object(
                     'id', ga.id,
                     'teamAId', ga.team_a, 'teamBId', ga.team_b,
                     'scoreA', ga.score_a, 'scoreB', ga.score_b,
                     'finished', ga.finished, 'played', true,
                     'rallies', coalesce((
                       select jsonb_agg(jsonb_build_object(
                                'id', r.id, 'teamId', r.team_id, 'kind', r.kind,
                                'action', r.action, 'playerId', r.player_id,
                                'scoreA', r.score_a, 'scoreB', r.score_b, 'at', r.at)
                              order by r.idx)
                         from public.rallies r where r.game_id = ga.id
                     ), '[]'::jsonb))
                   order by ga.idx)
              from public.games ga where ga.match_id = m.id
          ), '[]'::jsonb)
        ) as m_json
          from public.matches m
         where m.group_id = gid
         order by m.played_at desc
         limit 30
      ) x
  ), '[]'::jsonb);
end;
$$;


-- Incluir quem não está na lista pelo link do grupo (só amador): a pessoa
-- se inclui, ou quem já está na lista leva um convidado. Entra confirmada.
create or replace function public.guest_add_player(
  code text, p_event uuid, p_name text, p_invited_by uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare gid uuid; v_sport text; nome text; novo uuid; qtd int;
begin
  nome := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  if length(nome) < 2 or length(nome) > 40 then
    raise exception 'Nome precisa ter entre 2 e 40 letras';
  end if;

  -- Só pelada: time profissional tem elenco fechado, quem inclui é o técnico
  select g.id, g.sport into gid, v_sport from public.groups g
   where g.invite_code = upper(code) and g.mode = 'amador';
  if gid is null then
    raise exception 'Convite inválido';
  end if;
  if not exists (select 1 from public.events
                  where id = p_event and group_id = gid and not closed) then
    raise exception 'Este jogo não aceita mais respostas';
  end if;
  if p_invited_by is not null and not exists (
       select 1 from public.players where id = p_invited_by and group_id = gid and active) then
    raise exception 'Quem convida precisa estar na lista';
  end if;

  -- Mesmo nome já ativo no grupo: é quase sempre a mesma pessoa
  if exists (select 1 from public.players
              where group_id = gid and active and lower(name) = lower(nome)) then
    raise exception 'Já existe alguém com esse nome na lista';
  end if;

  -- Teto por jogo. O link é público dentro do grupo do WhatsApp; sem teto,
  -- um engraçadinho enche a lista.
  select count(*) into qtd
    from public.attendance a join public.players p on p.id = a.player_id
   where a.event_id = p_event and p.added_via_link;
  if qtd >= 20 then
    raise exception 'Limite de pessoas incluídas pelo link neste jogo';
  end if;

  insert into public.players (group_id, name, skills, added_via_link, invited_by)
  values (gid, nome, jsonb_build_object(v_sport, 3), true, p_invited_by)
  returning id into novo;

  insert into public.attendance (event_id, player_id, status)
  values (p_event, novo, 'vou');

  return novo;
end;
$$;

revoke execute on function public.guest_add_player(text, uuid, text, uuid) from public;
grant  execute on function public.guest_add_player(text, uuid, text, uuid) to anon, authenticated;

-- Funções nascem executáveis por todos. Restringe ao que cada papel precisa:
-- o convidado executa só as guest_*.
revoke execute on function public.guest_group(text)                              from public;
revoke execute on function public.guest_set_attendance(text, uuid, uuid, text)   from public;
revoke execute on function public.guest_athlete(text)                            from public;
revoke execute on function public.guest_update_athlete(text, date, int, numeric) from public;
revoke execute on function public.guest_matches(text, text)                      from public;
grant  execute on function public.guest_group(text)                              to anon, authenticated;
grant  execute on function public.guest_set_attendance(text, uuid, uuid, text)   to anon, authenticated;
grant  execute on function public.guest_athlete(text)                            to anon, authenticated;
grant  execute on function public.guest_update_athlete(text, date, int, numeric) to anon, authenticated;
grant  execute on function public.guest_matches(text, text)                      to anon, authenticated;

-- join_group fica sem permissão para todos. Com login aberto, quem tem o
-- código do grupo (ele vai no WhatsApp) viraria membro e leria pela RLS o
-- cadastro inteiro dos atletas. Co-organizador, quando existir, entra por
-- convite do dono.
revoke execute on function public.join_group(text) from public, anon, authenticated;

-- ═════════════════════════════════════════════════════════════
-- Incorporado da migração 005 — mensalistas e convidados. As funções
-- abaixo substituem as versões anteriores deste arquivo (create or replace).
-- ═════════════════════════════════════════════════════════════
alter table public.players
  add column if not exists kind text not null default 'mensalista'
  check (kind in ('mensalista', 'convidado'));

-- Quem entrou pelo link até agora era, na prática, convidado
update public.players set kind = 'convidado' where added_via_link and kind = 'mensalista';

-- Vagas do jogo. Nulo = sem limite: todo mundo que confirma joga.
alter table public.events
  add column if not exists slots int check (slots > 0);

-- Link de convidados, separado do link dos mensalistas
alter table public.groups
  add column if not exists guest_code text unique
  default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

-- Qual grupo e por qual porta: 'mensalistas' (invite_code) ou 'convidados'
-- (guest_code). Uso interno das guest_*; o convidado não chama direto.
create or replace function public.guest_resolve(code text, out gid uuid, out via text)
language plpgsql security definer stable set search_path = public as $$
begin
  select id, 'mensalistas' into gid, via from public.groups where invite_code = upper(code);
  if gid is null then
    select id, 'convidados' into gid, via from public.groups
     where guest_code = upper(code) and mode = 'amador';
  end if;
  if gid is null then
    raise exception 'Convite inválido';
  end if;
end;
$$;
revoke execute on function public.guest_resolve(text) from public, anon, authenticated;

-- A mesma tela para as duas portas. O app calcula vaga e fila a partir de
-- kind + status + answeredAt.
create or replace function public.guest_group(code text)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare r record; g public.groups; ev public.events;
begin
  select * into r from public.guest_resolve(code);
  select * into g from public.groups where id = r.gid;

  select * into ev from public.events
   where group_id = g.id and not closed
   order by starts_at asc limit 1;

  return jsonb_build_object(
    'via', r.via,
    'group', jsonb_build_object('name', g.name, 'sport', g.sport, 'mode', g.mode),
    'event', case when ev.id is null then null else jsonb_build_object(
      'id', ev.id, 'title', ev.title, 'startsAt', ev.starts_at, 'slots', ev.slots) end,
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id,
               'name', p.name,
               'kind', p.kind,
               'position', p.positions ->> g.sport,
               'status', a.status,
               'answeredAt', a.answered_at,
               'invitedBy', inv.name)
             order by p.name)
        from public.players p
        left join public.attendance a on a.player_id = p.id and a.event_id = ev.id
        left join public.players inv on inv.id = p.invited_by
       where p.group_id = g.id and p.active
    ), '[]'::jsonb)
  );
end;
$$;

-- Resposta de presença. Pelo link de convidados só se responde por convidado.
-- A hora da resposta só muda quando a resposta muda: apertar "vou" de novo
-- não pode jogar o convidado para o fim da fila.
create or replace function public.guest_set_attendance(
  code text, p_event uuid, p_player uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if p_status not in ('vou', 'nao_vou') then
    raise exception 'Resposta inválida';
  end if;
  select * into r from public.guest_resolve(code);
  if not exists (select 1 from public.events
                  where id = p_event and group_id = r.gid and not closed) then
    raise exception 'Este jogo não aceita mais respostas';
  end if;
  if not exists (select 1 from public.players
                  where id = p_player and group_id = r.gid and active
                    and (r.via = 'mensalistas' or kind = 'convidado')) then
    raise exception 'Jogador não encontrado neste grupo';
  end if;

  insert into public.attendance (event_id, player_id, status)
  values (p_event, p_player, p_status)
  on conflict (event_id, player_id) do update
    set status = excluded.status,
        answered_at = case when public.attendance.status = excluded.status
                           then public.attendance.answered_at else now() end;
end;
$$;

-- Convidado entra (ou volta) e confirma. Uso interno das duas portas.
-- Mesmo nome de convidado já cadastrado = a mesma pessoa voltando: reaproveita.
-- Mesmo nome de mensalista = recusa, para não virar duas pessoas.
create or replace function public.guest_upsert_convidado(
  gid uuid, p_event uuid, p_name text, p_invited_by uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare nome text; existente public.players; v_sport text; novo uuid; qtd int;
begin
  nome := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  if length(nome) < 2 or length(nome) > 40 then
    raise exception 'Nome precisa ter entre 2 e 40 letras';
  end if;
  if not exists (select 1 from public.events
                  where id = p_event and group_id = gid and not closed) then
    raise exception 'Este jogo não aceita mais respostas';
  end if;

  select * into existente from public.players
   where group_id = gid and active and lower(name) = lower(nome)
   limit 1;

  if existente.id is not null and existente.kind = 'mensalista' then
    raise exception 'Esse nome está na lista de mensalistas — use o link dos mensalistas';
  end if;

  if existente.id is not null then
    novo := existente.id;
  else
    -- Teto por jogo: o link é público dentro do WhatsApp
    select count(*) into qtd
      from public.attendance a join public.players p on p.id = a.player_id
     where a.event_id = p_event and p.kind = 'convidado';
    if qtd >= 40 then
      raise exception 'A lista de convidados deste jogo está cheia';
    end if;

    select sport into v_sport from public.groups where id = gid;
    insert into public.players (group_id, name, skills, kind, added_via_link, invited_by)
    values (gid, nome, jsonb_build_object(v_sport, 3), 'convidado', true, p_invited_by)
    returning id into novo;
  end if;

  insert into public.attendance (event_id, player_id, status)
  values (p_event, novo, 'vou')
  on conflict (event_id, player_id) do update
    set status = 'vou',
        answered_at = case when public.attendance.status = 'vou'
                           then public.attendance.answered_at else now() end;
  return novo;
end;
$$;
revoke execute on function public.guest_upsert_convidado(uuid, uuid, text, uuid) from public, anon, authenticated;

-- Porta 1: o mensalista leva alguém. Só pelo link dos mensalistas, e quem
-- leva tem de ser mensalista.
create or replace function public.guest_add_player(
  code text, p_event uuid, p_name text, p_invited_by uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from public.guest_resolve(code);
  if r.via <> 'mensalistas' then
    raise exception 'Convite inválido';
  end if;
  if p_invited_by is null or not exists (
       select 1 from public.players
        where id = p_invited_by and group_id = r.gid and active and kind = 'mensalista') then
    raise exception 'Só mensalista pode levar convidado';
  end if;
  return public.guest_upsert_convidado(r.gid, p_event, p_name, p_invited_by);
end;
$$;

-- Porta 2: o convidado se inscreve sozinho pelo link de convidados.
create or replace function public.guest_join(code text, p_event uuid, p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from public.guest_resolve(code);
  if r.via <> 'convidados' then
    raise exception 'Convite inválido';
  end if;
  return public.guest_upsert_convidado(r.gid, p_event, p_name, null);
end;
$$;

revoke execute on function public.guest_join(text, uuid, text) from public;
grant  execute on function public.guest_join(text, uuid, text) to anon, authenticated;
