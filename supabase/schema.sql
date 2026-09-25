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

-- ═════════════════════════════════════════════════════════════
-- Incorporado da migração 006 — cadastro pelo link e local do jogo.
-- ═════════════════════════════════════════════════════════════
alter table public.players
  add column if not exists phone text check (phone ~ '^[0-9]{10,13}$'),
  -- Pedido de cadastro ainda não aprovado: não aparece em link nenhum
  add column if not exists pending boolean not null default false;

-- Link de cadastro, separado do de confirmação: quem tem o de confirmar não
-- deve poder se cadastrar, e vice-versa
alter table public.groups
  add column if not exists register_code text unique
  default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

-- Local do jogo ("Quadra do Clube, Rua X")
alter table public.events
  add column if not exists location text check (length(location) <= 120);

-- Pedido de cadastro. Só grupo amador, só pelo link de cadastro.
create or replace function public.guest_register(
  code text, p_name text, p_birth date, p_phone text, p_position text, p_level int)
returns void language plpgsql security definer set search_path = public as $$
declare g public.groups; nome text; fone text; pendentes int;
begin
  select * into g from public.groups where register_code = upper(code) and mode = 'amador';
  if g.id is null then
    raise exception 'Link de cadastro inválido';
  end if;

  nome := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  if length(nome) < 2 or length(nome) > 40 then
    raise exception 'Nome precisa ter entre 2 e 40 letras';
  end if;
  fone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if fone !~ '^[0-9]{10,13}$' then
    raise exception 'Telefone inválido — use DDD e número';
  end if;
  if p_birth is null or p_birth > current_date or p_birth < current_date - interval '100 years' then
    raise exception 'Data de nascimento inválida';
  end if;
  if p_level is null or p_level not between 1 and 5 then
    raise exception 'Nível precisa ser de 1 a 5';
  end if;

  if exists (select 1 from public.players
              where group_id = g.id and active and lower(name) = lower(nome)) then
    raise exception 'Já existe um cadastro com esse nome. Fale com o organizador.';
  end if;

  -- Teto de pedidos em aberto: o link circula no WhatsApp
  select count(*) into pendentes from public.players
   where group_id = g.id and active and pending;
  if pendentes >= 50 then
    raise exception 'Muitos cadastros aguardando aprovação. Fale com o organizador.';
  end if;

  insert into public.players
    (group_id, name, skills, positions, birth_date, phone, kind, pending, added_via_link)
  values (
    g.id, nome,
    jsonb_build_object(g.sport, p_level),
    case when coalesce(p_position, '') = '' then '{}'::jsonb
         else jsonb_build_object(g.sport, p_position) end,
    p_birth, fone, 'mensalista', true, true);
end;
$$;

revoke execute on function public.guest_register(text, text, date, text, text, int) from public;
grant  execute on function public.guest_register(text, text, date, text, text, int) to anon, authenticated;

-- Nome do grupo e esporte, para a tela de cadastro montar as posições
create or replace function public.guest_register_info(code text)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare g public.groups;
begin
  select * into g from public.groups where register_code = upper(code) and mode = 'amador';
  if g.id is null then
    raise exception 'Link de cadastro inválido';
  end if;
  return jsonb_build_object('name', g.name, 'sport', g.sport);
end;
$$;

revoke execute on function public.guest_register_info(text) from public;
grant  execute on function public.guest_register_info(text) to anon, authenticated;

-- A tela dos links: sem pendentes, com o local do jogo. Telefone e
-- nascimento continuam de fora.
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
      'id', ev.id, 'title', ev.title, 'startsAt', ev.starts_at,
      'slots', ev.slots, 'location', ev.location) end,
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
       where p.group_id = g.id and p.active and not p.pending
    ), '[]'::jsonb)
  );
end;
$$;

-- Pendente também não confirma presença nem leva convidado
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
                  where id = p_player and group_id = r.gid and active and not pending
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

-- ═════════════════════════════════════════════════════════════
-- Incorporado da migração 007 — apelido.
-- ═════════════════════════════════════════════════════════════
alter table public.players
  add column if not exists nickname text check (length(nickname) <= 20);

drop function if exists public.guest_register(text, text, date, text, text, int);

create or replace function public.guest_register(
  code text, p_name text, p_birth date, p_phone text, p_position text, p_level int,
  p_nickname text default null)
returns void language plpgsql security definer set search_path = public as $$
declare g public.groups; nome text; apelido text; fone text; pendentes int;
begin
  select * into g from public.groups where register_code = upper(code) and mode = 'amador';
  if g.id is null then
    raise exception 'Link de cadastro inválido';
  end if;

  nome := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  if length(nome) < 2 or length(nome) > 40 then
    raise exception 'Nome precisa ter entre 2 e 40 letras';
  end if;
  apelido := nullif(btrim(regexp_replace(coalesce(p_nickname, ''), '\s+', ' ', 'g')), '');
  if apelido is not null and length(apelido) > 20 then
    raise exception 'Apelido pode ter até 20 letras';
  end if;
  fone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if fone !~ '^[0-9]{10,13}$' then
    raise exception 'Telefone inválido — use DDD e número';
  end if;
  if p_birth is null or p_birth > current_date or p_birth < current_date - interval '100 years' then
    raise exception 'Data de nascimento inválida';
  end if;
  if p_level is null or p_level not between 1 and 5 then
    raise exception 'Nível precisa ser de 1 a 5';
  end if;

  if exists (select 1 from public.players
              where group_id = g.id and active and lower(name) = lower(nome)) then
    raise exception 'Já existe um cadastro com esse nome. Fale com o organizador.';
  end if;

  select count(*) into pendentes from public.players
   where group_id = g.id and active and pending;
  if pendentes >= 50 then
    raise exception 'Muitos cadastros aguardando aprovação. Fale com o organizador.';
  end if;

  insert into public.players
    (group_id, name, nickname, skills, positions, birth_date, phone, kind, pending, added_via_link)
  values (
    g.id, nome, apelido,
    jsonb_build_object(g.sport, p_level),
    case when coalesce(p_position, '') = '' then '{}'::jsonb
         else jsonb_build_object(g.sport, p_position) end,
    p_birth, fone, 'mensalista', true, true);
end;
$$;

revoke execute on function public.guest_register(text, text, date, text, text, int, text) from public;
grant  execute on function public.guest_register(text, text, date, text, text, int, text) to anon, authenticated;

-- Nos links, o apelido aparece no lugar do nome (inclusive em "convidado de …")
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
      'id', ev.id, 'title', ev.title, 'startsAt', ev.starts_at,
      'slots', ev.slots, 'location', ev.location) end,
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id,
               'name', coalesce(nullif(p.nickname, ''), p.name),
               'kind', p.kind,
               'position', p.positions ->> g.sport,
               'status', a.status,
               'answeredAt', a.answered_at,
               'invitedBy', coalesce(nullif(inv.nickname, ''), inv.name))
             order by coalesce(nullif(p.nickname, ''), p.name))
        from public.players p
        left join public.attendance a on a.player_id = p.id and a.event_id = ev.id
        left join public.players inv on inv.id = p.invited_by
       where p.group_id = g.id and p.active and not p.pending
    ), '[]'::jsonb)
  );
end;
$$;

-- ═════════════════════════════════════════════════════════════
-- Incorporado da migração 008 — lista fechada e times no link.
-- ═════════════════════════════════════════════════════════════
alter table public.events
  add column if not exists list_closed boolean not null default false,
  add column if not exists teams jsonb
    check (teams is null or (jsonb_typeof(teams) = 'object' and pg_column_size(teams) < 20000));

-- O link: mesma tela, agora com a lista fechada e os times
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
      'id', ev.id, 'title', ev.title, 'startsAt', ev.starts_at,
      'slots', ev.slots, 'location', ev.location,
      'listClosed', ev.list_closed, 'teams', ev.teams) end,
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id,
               'name', coalesce(nullif(p.nickname, ''), p.name),
               'kind', p.kind,
               'position', p.positions ->> g.sport,
               'status', a.status,
               'answeredAt', a.answered_at,
               'invitedBy', coalesce(nullif(inv.nickname, ''), inv.name))
             order by coalesce(nullif(p.nickname, ''), p.name))
        from public.players p
        left join public.attendance a on a.player_id = p.id and a.event_id = ev.id
        left join public.players inv on inv.id = p.invited_by
       where p.group_id = g.id and p.active and not p.pending
    ), '[]'::jsonb)
  );
end;
$$;

-- Vou / não vou: lista fechada não aceita mais
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
  if exists (select 1 from public.events where id = p_event and list_closed) then
    raise exception 'A lista deste jogo está fechada. Fale com o organizador.';
  end if;
  if not exists (select 1 from public.players
                  where id = p_player and group_id = r.gid and active and not pending
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

-- Convidado entrando pelas duas portas: lista fechada também não aceita
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
  if exists (select 1 from public.events where id = p_event and list_closed) then
    raise exception 'A lista deste jogo está fechada. Fale com o organizador.';
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

-- ═════════════════════════════════════════════════════════════
-- Incorporado da migração 009 — cadastro com nome que já existe.
-- ═════════════════════════════════════════════════════════════
create or replace function public.guest_register(
  code text, p_name text, p_birth date, p_phone text, p_position text, p_level int,
  p_nickname text default null)
returns void language plpgsql security definer set search_path = public as $$
declare g public.groups; nome text; apelido text; fone text; pendentes int;
begin
  select * into g from public.groups where register_code = upper(code) and mode = 'amador';
  if g.id is null then
    raise exception 'Link de cadastro inválido';
  end if;

  nome := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  if length(nome) < 2 or length(nome) > 40 then
    raise exception 'Nome precisa ter entre 2 e 40 letras';
  end if;
  apelido := nullif(btrim(regexp_replace(coalesce(p_nickname, ''), '\s+', ' ', 'g')), '');
  if apelido is not null and length(apelido) > 20 then
    raise exception 'Apelido pode ter até 20 letras';
  end if;
  fone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if fone !~ '^[0-9]{10,13}$' then
    raise exception 'Telefone inválido — use DDD e número';
  end if;
  if p_birth is null or p_birth > current_date or p_birth < current_date - interval '100 years' then
    raise exception 'Data de nascimento inválida';
  end if;
  if p_level is null or p_level not between 1 and 5 then
    raise exception 'Nível precisa ser de 1 a 5';
  end if;

  -- Só o pedido repetido é barrado. Nome de quem já está no grupo passa:
  -- o administrador junta na aprovação.
  if exists (select 1 from public.players
              where group_id = g.id and active and pending and lower(name) = lower(nome)) then
    raise exception 'Seu cadastro já foi enviado e está aguardando a aprovação do organizador.';
  end if;

  -- Teto de pedidos em aberto: o link circula no WhatsApp
  select count(*) into pendentes from public.players
   where group_id = g.id and active and pending;
  if pendentes >= 50 then
    raise exception 'Muitos cadastros aguardando aprovação. Fale com o organizador.';
  end if;

  insert into public.players
    (group_id, name, nickname, skills, positions, birth_date, phone, kind, pending, added_via_link)
  values (
    g.id, nome, apelido,
    jsonb_build_object(g.sport, p_level),
    case when coalesce(p_position, '') = '' then '{}'::jsonb
         else jsonb_build_object(g.sport, p_position) end,
    p_birth, fone, 'mensalista', true, true);
end;
$$;

revoke execute on function public.guest_register(text, text, date, text, text, int, text) from public;
grant  execute on function public.guest_register(text, text, date, text, text, int, text) to anon, authenticated;

-- ═════════════════════════════════════════════════════════════
-- Incorporado da migração 010 — atletas únicos em todos os aparelhos.
-- ═════════════════════════════════════════════════════════════
alter table public.players
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists synced_at  timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create index if not exists players_sync_idx on public.players (group_id, synced_at);

-- Toda gravação — do organizador, dos links, de qualquer função — carimba a
-- hora de chegada. É o que garante que nenhuma mudança escapa da leitura.
create or replace function public.players_carimbar_chegada()
returns trigger language plpgsql set search_path = public as $$
begin
  new.synced_at := now();
  return new;
end;
$$;

drop trigger if exists players_synced_at on public.players;
create trigger players_synced_at
  before insert or update on public.players
  for each row execute function public.players_carimbar_chegada();

-- Grava um lote de jogadores do organizador. Vale a edição mais recente:
-- a linha só é sobrescrita se a que chega tem updated_at MAIOR. Um aparelho
-- desatualizado não atropela o que outro gravou depois.
--
-- security invoker: roda com as permissões de quem chama, então a RLS de
-- `players` vale inteira — só o dono/organizador do grupo grava.
create or replace function public.salvar_jogadores(p_group uuid, p_rows jsonb)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not public.can_manage_group(p_group) then
    raise exception 'Sem permissão neste grupo';
  end if;

  insert into public.players as p
    (id, group_id, name, nickname, skills, positions, is_keeper, kind, pending,
     birth_date, phone, active, deleted_at, updated_at)
  select r.id, p_group, r.name, r.nickname,
         coalesce(r.skills, '{}'::jsonb), coalesce(r.positions, '{}'::jsonb),
         coalesce(r.is_keeper, false), coalesce(r.kind, 'mensalista'),
         coalesce(r.pending, false), r.birth_date, r.phone,
         r.deleted_at is null, r.deleted_at, r.updated_at
    from jsonb_to_recordset(p_rows) as r(
           id uuid, name text, nickname text, skills jsonb, positions jsonb,
           is_keeper boolean, kind text, pending boolean, birth_date date,
           phone text, deleted_at timestamptz, updated_at timestamptz)
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
    active     = excluded.active,
    deleted_at = excluded.deleted_at,
    updated_at = excluded.updated_at
  where p.group_id = p_group
    and p.updated_at < excluded.updated_at;
end;
$$;

revoke execute on function public.salvar_jogadores(uuid, jsonb) from public, anon;
grant  execute on function public.salvar_jogadores(uuid, jsonb) to authenticated;

-- ═════════════════════════════════════════════════════════════
-- Incorporado da migração 011 — posição do convidado.
-- ═════════════════════════════════════════════════════════════
drop function if exists public.guest_join(text, uuid, text);
drop function if exists public.guest_add_player(text, uuid, text, uuid);
drop function if exists public.guest_upsert_convidado(uuid, uuid, text, uuid);

-- Convidado entra (ou volta) e confirma. Uso interno das duas portas.
create or replace function public.guest_upsert_convidado(
  gid uuid, p_event uuid, p_name text, p_invited_by uuid, p_position text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare nome text; posicao text; existente public.players; v_sport text; novo uuid; qtd int;
begin
  nome := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  if length(nome) < 2 or length(nome) > 40 then
    raise exception 'Nome precisa ter entre 2 e 40 letras';
  end if;
  posicao := nullif(btrim(coalesce(p_position, '')), '');
  if posicao is not null and length(posicao) > 30 then
    raise exception 'Posição inválida';
  end if;
  if not exists (select 1 from public.events
                  where id = p_event and group_id = gid and not closed) then
    raise exception 'Este jogo não aceita mais respostas';
  end if;
  if exists (select 1 from public.events where id = p_event and list_closed) then
    raise exception 'A lista deste jogo está fechada. Fale com o organizador.';
  end if;

  select sport into v_sport from public.groups where id = gid;

  select * into existente from public.players
   where group_id = gid and active and lower(name) = lower(nome)
   limit 1;

  if existente.id is not null and existente.kind = 'mensalista' then
    raise exception 'Esse nome está na lista de mensalistas — use o link dos mensalistas';
  end if;

  if existente.id is not null then
    novo := existente.id;
    -- Quem volta só ganha posição se não tinha: não desfaz o ajuste do administrador
    if posicao is not null and coalesce(existente.positions ->> v_sport, '') = '' then
      update public.players
         set positions  = coalesce(positions, '{}'::jsonb) || jsonb_build_object(v_sport, posicao),
             updated_at = now()
       where id = existente.id;
    end if;
  else
    -- Teto por jogo: o link é público dentro do WhatsApp
    select count(*) into qtd
      from public.attendance a join public.players p on p.id = a.player_id
     where a.event_id = p_event and p.kind = 'convidado';
    if qtd >= 40 then
      raise exception 'A lista de convidados deste jogo está cheia';
    end if;

    insert into public.players (group_id, name, skills, positions, kind, added_via_link, invited_by)
    values (gid, nome, jsonb_build_object(v_sport, 3),
            case when posicao is null then '{}'::jsonb else jsonb_build_object(v_sport, posicao) end,
            'convidado', true, p_invited_by)
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
revoke execute on function public.guest_upsert_convidado(uuid, uuid, text, uuid, text) from public, anon, authenticated;

-- Porta 1: o mensalista leva alguém. Só pelo link dos mensalistas, e quem
-- leva tem de ser mensalista.
create or replace function public.guest_add_player(
  code text, p_event uuid, p_name text, p_invited_by uuid default null, p_position text default null)
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
  return public.guest_upsert_convidado(r.gid, p_event, p_name, p_invited_by, p_position);
end;
$$;
revoke execute on function public.guest_add_player(text, uuid, text, uuid, text) from public;
grant  execute on function public.guest_add_player(text, uuid, text, uuid, text) to anon, authenticated;

-- Porta 2: o convidado se inscreve sozinho pelo link de convidados.
create or replace function public.guest_join(
  code text, p_event uuid, p_name text, p_position text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from public.guest_resolve(code);
  if r.via <> 'convidados' then
    raise exception 'Convite inválido';
  end if;
  return public.guest_upsert_convidado(r.gid, p_event, p_name, null, p_position);
end;
$$;
revoke execute on function public.guest_join(text, uuid, text, text) from public;
grant  execute on function public.guest_join(text, uuid, text, text) to anon, authenticated;

-- ═════════════════════════════════════════════════════════════
-- Incorporado da migração 012 — segundo administrador.
-- ═════════════════════════════════════════════════════════════
create or replace function public.is_group_owner(gid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.groups where id = gid and owner_id = auth.uid());
$$;

-- ── Quem mexe em quem é administrador ──
-- Só o dono gerencia membros. Qualquer um pode sair sozinho — menos o dono.
drop policy if exists members_manage on public.group_members;
drop policy if exists members_owner_manage on public.group_members;
create policy members_owner_manage on public.group_members
  for all using (public.is_group_owner(group_id))
  with check (public.is_group_owner(group_id));

drop policy if exists members_self_leave on public.group_members;
create policy members_self_leave on public.group_members
  for delete using (user_id = auth.uid() and role <> 'dono');

-- ── Convites de administrador ──
create table if not exists public.admin_invites (
  -- 64 caracteres aleatórios: o link é a única barreira
  token      text primary key
             default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  group_id   uuid not null references public.groups on delete cascade,
  created_by uuid not null default auth.uid() references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '48 hours',
  used_by    uuid references public.profiles on delete set null,
  used_at    timestamptz
);

alter table public.admin_invites enable row level security;

-- Só o dono cria, vê e cancela os convites do grupo dele
drop policy if exists admin_invites_owner on public.admin_invites;
create policy admin_invites_owner on public.admin_invites
  for all using (public.is_group_owner(group_id))
  with check (public.is_group_owner(group_id));

-- O que o link mostra antes de aceitar: só o nome do grupo e se ainda vale.
-- Aberto a quem não entrou ainda, para a tela dizer de qual grupo é o convite.
create or replace function public.convite_admin_info(p_token text)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare i public.admin_invites; g public.groups;
begin
  select * into i from public.admin_invites where token = p_token;
  if i.token is null then
    raise exception 'Convite inválido';
  end if;
  select * into g from public.groups where id = i.group_id;
  return jsonb_build_object(
    'group', g.name,
    'mode', g.mode,
    'expirado', i.expires_at < now(),
    'usado', i.used_at is not null,
    'usadoPorMim', i.used_by is not null and i.used_by = auth.uid());
end;
$$;

-- Aceitar: vira organizador do grupo e o convite fica gasto. Quem já é
-- membro continua com o papel que tem (o dono não vira organizador).
create or replace function public.aceitar_convite_admin(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare i public.admin_invites; g public.groups; eu uuid := auth.uid();
begin
  if eu is null then
    raise exception 'Entre com sua conta para aceitar o convite';
  end if;
  select * into i from public.admin_invites where token = p_token for update;
  if i.token is null then
    raise exception 'Convite inválido';
  end if;
  if i.used_at is not null and i.used_by is distinct from eu then
    raise exception 'Este convite já foi usado. Peça outro ao dono do grupo.';
  end if;
  if i.used_at is null and i.expires_at < now() then
    raise exception 'Este convite expirou. Peça outro ao dono do grupo.';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (i.group_id, eu, 'organizador')
  on conflict (group_id, user_id) do nothing;

  update public.admin_invites set used_by = eu, used_at = now()
   where token = p_token and used_at is null;

  select * into g from public.groups where id = i.group_id;
  return jsonb_build_object('group', g.name, 'mode', g.mode);
end;
$$;

-- Os administradores do grupo, com nome e foto — para a lista em Ajustes.
-- profiles só deixa cada um ler o próprio; esta função mostra os do grupo
-- a quem é membro dele.
create or replace function public.admins_do_grupo(gid uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_group_member(gid) then
    raise exception 'Sem permissão neste grupo';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'userId', m.user_id, 'role', m.role, 'name', p.name,
             'avatarUrl', p.avatar_url, 'desde', m.created_at, 'souEu', m.user_id = auth.uid())
           order by (m.role = 'dono') desc, m.created_at)
      from public.group_members m
      join public.profiles p on p.id = m.user_id
     where m.group_id = gid and m.role in ('dono', 'organizador')
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.is_group_owner(uuid)          from public, anon;
grant  execute on function public.is_group_owner(uuid)          to authenticated;
revoke execute on function public.convite_admin_info(text)      from public;
grant  execute on function public.convite_admin_info(text)      to anon, authenticated;
revoke execute on function public.aceitar_convite_admin(text)   from public, anon;
grant  execute on function public.aceitar_convite_admin(text)   to authenticated;
revoke execute on function public.admins_do_grupo(uuid)         from public, anon;
grant  execute on function public.admins_do_grupo(uuid)         to authenticated;


-- ─────────────────────────────────────────────────────────────
-- Incorporado da migração 013 — jogos, sorteios e partidas na base única.
-- 013 — Jogos, sorteios e partidas na base única (fase 2)
--
-- Pedido do Guilherme em 24/09/2026: a aba Jogo lista TODOS os jogos
-- programados, e cada um abre com confirmados, times, partida e estatística —
-- iguais em qualquer aparelho, e para o segundo administrador também.
--
-- O jogo é o evento da nuvem (events). Até aqui só havia um aberto por vez;
-- agora vários ficam programados, e os links do WhatsApp mostram o PRÓXIMO
-- (decidido pelo Guilherme): o mais cedo ainda não encerrado, a partir de 12 h
-- atrás — o jogo de hoje continua no link durante a pelada, e o da semana
-- passada esquecido aberto não fica no lugar do de amanhã.
--
-- Mesma regra dos atletas (migração 010): updated_at é a hora da EDIÇÃO e
-- decide quem vence; synced_at é a hora de CHEGADA, carimbada aqui, e guia a
-- leitura incremental.
--
-- Rodar uma vez no SQL Editor, DEPOIS da 012. Não apaga dados: acrescenta
-- colunas, troca um limite de valores, cria duas funções de gravação e troca
-- a função do link para mostrar o próximo jogo.
-- ─────────────────────────────────────────────────────────────

-- Gatilho genérico de chegada (a 010 tem um só para players)
create or replace function public.carimbar_chegada()
returns trigger language plpgsql set search_path = public as $$
begin
  new.synced_at := now();
  return new;
end;
$$;

-- ── Jogos ──
alter table public.events
  add column if not exists status text not null default 'programado'
    check (status in ('programado', 'encerrado', 'cancelado')),
  -- O sorteio inteiro do organizador (com nível). Só membros leem: o link
  -- continua vendo só `teams`, sem nível
  add column if not exists sorteio jsonb
    check (sorteio is null or pg_column_size(sorteio) < 100000),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists synced_at  timestamptz not null default now();

update public.events set status = 'encerrado' where closed and status = 'programado';

create index if not exists events_sync_idx on public.events (group_id, synced_at);
drop trigger if exists events_synced_at on public.events;
create trigger events_synced_at
  before insert or update on public.events
  for each row execute function public.carimbar_chegada();

-- ── Respostas ──
-- "Sem resposta" vira linha, em vez de apagar: é o que deixa os outros
-- aparelhos saberem que o organizador desmarcou alguém.
alter table public.attendance drop constraint if exists attendance_status_check;
alter table public.attendance
  add constraint attendance_status_check check (status in ('vou', 'nao_vou', 'sem_resposta'));

-- ── Partidas ──
-- A partida encerrada sobe inteira em `dados` (o mesmo formato do aparelho,
-- com ids da nuvem). As tabelas games/rallies continuam para o link de
-- resultados, que é outra etapa.
alter table public.matches
  add column if not exists event_id   uuid references public.events on delete set null,
  add column if not exists dados      jsonb check (dados is null or pg_column_size(dados) < 2000000),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists synced_at  timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create index if not exists matches_sync_idx on public.matches (group_id, synced_at);
drop trigger if exists matches_synced_at on public.matches;
create trigger matches_synced_at
  before insert or update on public.matches
  for each row execute function public.carimbar_chegada();

-- Grava jogos do organizador — vale o updated_at maior. `closed` acompanha o
-- status (as funções dos links olham `closed`). `list_closed` e `teams` NÃO
-- passam por aqui: são gravados na hora, por quem fecha a lista ou publica.
create or replace function public.salvar_jogos(p_group uuid, p_rows jsonb)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not public.can_manage_group(p_group) then
    raise exception 'Sem permissão neste grupo';
  end if;
  insert into public.events as e
    (id, group_id, title, starts_at, location, slots, status, closed, sorteio, updated_at)
  select r.id, p_group, r.title, r.starts_at, r.location, r.slots,
         coalesce(r.status, 'programado'), coalesce(r.status, 'programado') <> 'programado',
         r.sorteio, r.updated_at
    from jsonb_to_recordset(p_rows) as r(
           id uuid, title text, starts_at timestamptz, location text, slots int,
           status text, sorteio jsonb, updated_at timestamptz)
  on conflict (id) do update set
    title      = excluded.title,
    starts_at  = excluded.starts_at,
    location   = excluded.location,
    slots      = excluded.slots,
    status     = excluded.status,
    closed     = excluded.closed,
    sorteio    = excluded.sorteio,
    updated_at = excluded.updated_at
  where e.group_id = p_group
    and e.updated_at < excluded.updated_at;
end;
$$;

-- Grava partidas encerradas — vale o updated_at maior; exclusão é marca.
create or replace function public.salvar_partidas(p_group uuid, p_rows jsonb)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not public.can_manage_group(p_group) then
    raise exception 'Sem permissão neste grupo';
  end if;
  insert into public.matches as m
    (id, group_id, sport, played_at, event_id, dados, deleted_at, updated_at, created_by)
  select r.id, p_group, r.sport, r.played_at, r.event_id, r.dados, r.deleted_at,
         r.updated_at, auth.uid()
    from jsonb_to_recordset(p_rows) as r(
           id uuid, sport text, played_at timestamptz, event_id uuid, dados jsonb,
           deleted_at timestamptz, updated_at timestamptz)
  on conflict (id) do update set
    sport      = excluded.sport,
    played_at  = excluded.played_at,
    event_id   = excluded.event_id,
    dados      = excluded.dados,
    deleted_at = excluded.deleted_at,
    updated_at = excluded.updated_at
  where m.group_id = p_group
    and m.updated_at < excluded.updated_at;
end;
$$;

revoke execute on function public.salvar_jogos(uuid, jsonb)    from public, anon;
grant  execute on function public.salvar_jogos(uuid, jsonb)    to authenticated;
revoke execute on function public.salvar_partidas(uuid, jsonb) from public, anon;
grant  execute on function public.salvar_partidas(uuid, jsonb) to authenticated;

-- ── O link mostra o PRÓXIMO jogo ──
-- O mais cedo ainda não encerrado, a partir de 12 h atrás. Mesmo corpo da
-- versão da 008, só muda a escolha do jogo.
create or replace function public.guest_group(code text)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare r record; g public.groups; ev public.events;
begin
  select * into r from public.guest_resolve(code);
  select * into g from public.groups where id = r.gid;

  select * into ev from public.events
   where group_id = g.id and not closed
     and starts_at >= now() - interval '12 hours'
   order by starts_at asc limit 1;

  return jsonb_build_object(
    'via', r.via,
    'group', jsonb_build_object('name', g.name, 'sport', g.sport, 'mode', g.mode),
    'event', case when ev.id is null then null else jsonb_build_object(
      'id', ev.id, 'title', ev.title, 'startsAt', ev.starts_at,
      'slots', ev.slots, 'location', ev.location,
      'listClosed', ev.list_closed, 'teams', ev.teams) end,
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id,
               'name', coalesce(nullif(p.nickname, ''), p.name),
               'kind', p.kind,
               'position', p.positions ->> g.sport,
               'status', case when a.status = 'sem_resposta' then null else a.status end,
               'answeredAt', a.answered_at,
               'invitedBy', coalesce(nullif(inv.nickname, ''), inv.name))
             order by coalesce(nullif(p.nickname, ''), p.name))
        from public.players p
        left join public.attendance a on a.player_id = p.id and a.event_id = ev.id
        left join public.players inv on inv.id = p.invited_by
       where p.group_id = g.id and p.active and not p.pending
    ), '[]'::jsonb)
  );
end;
$$;


-- ─────────────────────────────────────────────────────────────
-- Incorporado da migração 014 — o esporte é do jogo.
-- 014 — O esporte é do JOGO, não só do grupo
--
-- Pedido do Guilherme em 25/09/2026: a aba Jogo deixa de ter o seletor de
-- esporte no topo; o esporte é escolhido ao criar cada jogo, aparece no
-- cartão e filtra a lista. Um grupo pode marcar futebol na terça e vôlei na
-- quinta.
--
-- Até aqui o evento não guardava esporte — valia o do grupo. Agora:
--   - `events.sport`, preenchido nos jogos que já existem com o do sorteio
--     (quando houve) ou o do grupo;
--   - `salvar_jogos` grava o esporte;
--   - os links usam o esporte do JOGO: a lista de posições e a posição que o
--     convidado escolhe ao se inscrever (antes, a do grupo).
--
-- Rodar uma vez no SQL Editor, DEPOIS da 013. Não apaga dados: acrescenta uma
-- coluna, preenche ela e troca três funções.
-- ─────────────────────────────────────────────────────────────

alter table public.events
  add column if not exists sport text
    check (sport is null or sport in ('futebol', 'volei', 'basquete'));

update public.events e
   set sport = coalesce(e.sorteio ->> 'sport', g.sport)
  from public.groups g
 where g.id = e.group_id and e.sport is null;

-- Mesma função da 013, agora com o esporte. Sem esporte na linha (aparelho
-- desatualizado), fica o que já estava — ou o do grupo, num jogo novo.
create or replace function public.salvar_jogos(p_group uuid, p_rows jsonb)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not public.can_manage_group(p_group) then
    raise exception 'Sem permissão neste grupo';
  end if;
  insert into public.events as e
    (id, group_id, title, starts_at, location, slots, sport, status, closed, sorteio, updated_at)
  select r.id, p_group, r.title, r.starts_at, r.location, r.slots,
         coalesce(r.sport, (select g.sport from public.groups g where g.id = p_group)),
         coalesce(r.status, 'programado'), coalesce(r.status, 'programado') <> 'programado',
         r.sorteio, r.updated_at
    from jsonb_to_recordset(p_rows) as r(
           id uuid, title text, starts_at timestamptz, location text, slots int,
           sport text, status text, sorteio jsonb, updated_at timestamptz)
  on conflict (id) do update set
    title      = excluded.title,
    starts_at  = excluded.starts_at,
    location   = excluded.location,
    slots      = excluded.slots,
    sport      = coalesce(excluded.sport, e.sport),
    status     = excluded.status,
    closed     = excluded.closed,
    sorteio    = excluded.sorteio,
    updated_at = excluded.updated_at
  where e.group_id = p_group
    and e.updated_at < excluded.updated_at;
end;
$$;

revoke execute on function public.salvar_jogos(uuid, jsonb) from public, anon;
grant  execute on function public.salvar_jogos(uuid, jsonb) to authenticated;

-- Mesma função da 011; só muda de onde vem o esporte da posição
create or replace function public.guest_upsert_convidado(
  gid uuid, p_event uuid, p_name text, p_invited_by uuid, p_position text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare nome text; posicao text; existente public.players; v_sport text; novo uuid; qtd int;
begin
  nome := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  if length(nome) < 2 or length(nome) > 40 then
    raise exception 'Nome precisa ter entre 2 e 40 letras';
  end if;
  posicao := nullif(btrim(coalesce(p_position, '')), '');
  if posicao is not null and length(posicao) > 30 then
    raise exception 'Posição inválida';
  end if;
  if not exists (select 1 from public.events
                  where id = p_event and group_id = gid and not closed) then
    raise exception 'Este jogo não aceita mais respostas';
  end if;
  if exists (select 1 from public.events where id = p_event and list_closed) then
    raise exception 'A lista deste jogo está fechada. Fale com o organizador.';
  end if;

  select coalesce(e.sport, g.sport) into v_sport
    from public.events e join public.groups g on g.id = e.group_id
   where e.id = p_event;

  select * into existente from public.players
   where group_id = gid and active and lower(name) = lower(nome)
   limit 1;

  if existente.id is not null and existente.kind = 'mensalista' then
    raise exception 'Esse nome está na lista de mensalistas — use o link dos mensalistas';
  end if;

  if existente.id is not null then
    novo := existente.id;
    -- Quem volta só ganha posição se não tinha: não desfaz o ajuste do administrador
    if posicao is not null and coalesce(existente.positions ->> v_sport, '') = '' then
      update public.players
         set positions  = coalesce(positions, '{}'::jsonb) || jsonb_build_object(v_sport, posicao),
             updated_at = now()
       where id = existente.id;
    end if;
  else
    -- Teto por jogo: o link é público dentro do WhatsApp
    select count(*) into qtd
      from public.attendance a join public.players p on p.id = a.player_id
     where a.event_id = p_event and p.kind = 'convidado';
    if qtd >= 40 then
      raise exception 'A lista de convidados deste jogo está cheia';
    end if;

    insert into public.players (group_id, name, skills, positions, kind, added_via_link, invited_by)
    values (gid, nome, jsonb_build_object(v_sport, 3),
            case when posicao is null then '{}'::jsonb else jsonb_build_object(v_sport, posicao) end,
            'convidado', true, p_invited_by)
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
revoke execute on function public.guest_upsert_convidado(uuid, uuid, text, uuid, text) from public, anon, authenticated;

-- Mesma função da 013; o esporte que o link mostra é o do jogo
create or replace function public.guest_group(code text)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare r record; g public.groups; ev public.events; v_sport text;
begin
  select * into r from public.guest_resolve(code);
  select * into g from public.groups where id = r.gid;

  select * into ev from public.events
   where group_id = g.id and not closed
     and starts_at >= now() - interval '12 hours'
   order by starts_at asc limit 1;

  v_sport := coalesce(ev.sport, g.sport);

  return jsonb_build_object(
    'via', r.via,
    'group', jsonb_build_object('name', g.name, 'sport', v_sport, 'mode', g.mode),
    'event', case when ev.id is null then null else jsonb_build_object(
      'id', ev.id, 'title', ev.title, 'startsAt', ev.starts_at,
      'slots', ev.slots, 'location', ev.location,
      'listClosed', ev.list_closed, 'teams', ev.teams) end,
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id,
               'name', coalesce(nullif(p.nickname, ''), p.name),
               'kind', p.kind,
               'position', p.positions ->> v_sport,
               'status', case when a.status = 'sem_resposta' then null else a.status end,
               'answeredAt', a.answered_at,
               'invitedBy', coalesce(nullif(inv.nickname, ''), inv.name))
             order by coalesce(nullif(p.nickname, ''), p.name))
        from public.players p
        left join public.attendance a on a.player_id = p.id and a.event_id = ev.id
        left join public.players inv on inv.id = p.invited_by
       where p.group_id = g.id and p.active and not p.pending
    ), '[]'::jsonb)
  );
end;
$$;
