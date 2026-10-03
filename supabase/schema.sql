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


-- ─────────────────────────────────────────────────────────────
-- Incorporado da migração 015 — fila de espera com confirmação.
-- 015 — Fila de espera com confirmação
--
-- Pedido do Guilherme em 25/09/2026. Com a lista FECHADA, quem chega pelo
-- link entra numa fila de espera; quando alguém com vaga sai, o primeiro da
-- espera é CHAMADO e precisa confirmar que ainda quer jogar. Sim, entra;
-- não, chama o próximo. O administrador vê quem foi chamado, avisa pelo
-- WhatsApp e pode passar a vez adiante — não há prazo automático.
--
-- Com a lista ABERTA nada muda: o convidado que passa das vagas fica na fila
-- e entra sozinho quando abre vaga (calculado no app, `distribuirVagas`).
--
-- Estados novos da resposta:
--   espera   — na fila de espera da lista fechada; não joga
--   chamado  — abriu vaga para ele; a vaga fica reservada até ele responder
--   pulado   — o administrador passou a vez; respondendo "vou" depois, volta
--              para o fim da espera
--
-- Quem chama é o BANCO, num gatilho: vale igual para quem sai pelo link e
-- para o administrador que desmarca no app — uma regra só, sem cópia.
--
-- Ordem da espera: mensalista antes de convidado (a prioridade de sempre),
-- depois por `espera_desde`. `answered_at` continua sendo a hora da última
-- mudança, que é o que o app usa para saber o que é mais novo.
--
-- Rodar uma vez no SQL Editor, DEPOIS da 014. Não apaga dados: acrescenta
-- três colunas, troca um limite de valores, cria duas funções internas com
-- dois gatilhos e troca três funções dos links.
-- ─────────────────────────────────────────────────────────────

alter table public.attendance drop constraint if exists attendance_status_check;
alter table public.attendance
  add constraint attendance_status_check
  check (status in ('vou', 'nao_vou', 'sem_resposta', 'espera', 'chamado', 'pulado'));

alter table public.attendance
  add column if not exists espera_desde timestamptz,
  add column if not exists chamado_em   timestamptz,
  -- Quem saiu e abriu a vaga: é o que diz ao administrador em que time o
  -- chamado entraria
  add column if not exists vaga_de      uuid references public.players on delete set null;

-- ── Chamar o próximo ──
-- Enquanto houver vaga livre (lista fechada, com limite), o primeiro da
-- espera vira chamado. A vaga do chamado fica reservada: ele conta como
-- ocupando, senão o mesmo buraco chamaria duas pessoas.
create or replace function public.chamar_proximo(p_event uuid, p_vaga_de uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare ev public.events; ocupadas int; prox uuid; de uuid := p_vaga_de;
begin
  select * into ev from public.events where id = p_event;
  if ev.id is null or ev.closed or not ev.list_closed or ev.slots is null then
    return;
  end if;
  loop
    select count(*) into ocupadas
      from public.attendance a join public.players p on p.id = a.player_id
     where a.event_id = p_event and a.status in ('vou', 'chamado')
       and p.active and not p.pending;
    exit when ocupadas >= ev.slots;

    select a.player_id into prox
      from public.attendance a join public.players p on p.id = a.player_id
     where a.event_id = p_event and a.status = 'espera'
       and p.active and not p.pending
     order by (p.kind = 'convidado'), coalesce(a.espera_desde, a.answered_at), a.player_id
     limit 1;
    exit when prox is null;

    update public.attendance
       set status = 'chamado', chamado_em = now(), vaga_de = de, answered_at = now()
     where event_id = p_event and player_id = prox;
    -- Uma saída abre uma vaga; as seguintes (vagas aumentadas) não têm dono
    de := null;
  end loop;
end;
$$;
revoke execute on function public.chamar_proximo(uuid, uuid) from public, anon, authenticated;

-- Toda mudança de resposta numa lista fechada pode abrir vaga
create or replace function public.fila_ao_responder()
returns trigger language plpgsql security definer set search_path = public as $$
declare de uuid;
begin
  -- As mudanças que as próprias funções da fila fazem não disparam de novo
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  if tg_op = 'UPDATE' then
    if old.status = 'vou' and new.status <> 'vou' then
      de := new.player_id;
    elsif old.status = 'chamado' and new.status not in ('vou', 'chamado') then
      de := old.vaga_de;
    end if;
  end if;
  perform public.chamar_proximo(new.event_id, de);
  return null;
end;
$$;

drop trigger if exists attendance_fila on public.attendance;
create trigger attendance_fila
  after insert or update on public.attendance
  for each row execute function public.fila_ao_responder();

-- Fechar a lista congela a fila em espera; reabrir devolve todos à fila de
-- sempre. Mudar as vagas com a lista fechada pode chamar alguém.
create or replace function public.fila_ao_fechar()
returns trigger language plpgsql security definer set search_path = public as $$
declare mensalistas int;
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  if new.list_closed and not old.list_closed and new.slots is not null then
    -- Os convidados que estavam na fila (passavam das vagas) vão para a
    -- espera, na ordem em que estavam
    select count(*) into mensalistas
      from public.attendance a join public.players p on p.id = a.player_id
     where a.event_id = new.id and a.status = 'vou' and p.kind = 'mensalista'
       and p.active and not p.pending;

    update public.attendance a
       set status = 'espera', espera_desde = a.answered_at, answered_at = now()
     where a.event_id = new.id
       and a.player_id in (
         select a2.player_id
           from public.attendance a2 join public.players p2 on p2.id = a2.player_id
          where a2.event_id = new.id and a2.status = 'vou' and p2.kind = 'convidado'
            and p2.active and not p2.pending
          order by a2.answered_at, a2.player_id
         offset greatest(0, new.slots - mensalistas));

  elsif old.list_closed and not new.list_closed then
    -- De volta à fila de sempre, na ordem da espera. Cada um ganha um
    -- milissegundo a mais que o anterior: a ordem da fila aberta é
    -- `answered_at`, e ele também precisa ser mais novo que o do app
    update public.attendance a
       set status = 'vou', chamado_em = null, vaga_de = null,
           answered_at = now() + (o.n * interval '1 millisecond')
      from (select a2.player_id,
                   row_number() over (order by coalesce(a2.espera_desde, a2.answered_at), a2.player_id) as n
              from public.attendance a2
             where a2.event_id = new.id and a2.status in ('espera', 'chamado', 'pulado')) o
     where a.event_id = new.id and a.player_id = o.player_id;
  end if;

  perform public.chamar_proximo(new.id, null);
  return null;
end;
$$;

drop trigger if exists events_fila on public.events;
create trigger events_fila
  after update of list_closed, slots on public.events
  for each row execute function public.fila_ao_fechar();

-- ── Resposta pelo link ──
-- Lista aberta: como sempre. Lista fechada:
--   "não vou"  — sempre aceito: quem tinha vaga libera, quem esperava sai;
--   "vou"      — o chamado aceita e entra; os outros vão para a espera.
create or replace function public.guest_set_attendance(
  code text, p_event uuid, p_player uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare r record; fechada boolean; atual text; novo text;
begin
  if p_status not in ('vou', 'nao_vou') then
    raise exception 'Resposta inválida';
  end if;
  select * into r from public.guest_resolve(code);
  select list_closed into fechada from public.events
   where id = p_event and group_id = r.gid and not closed;
  if fechada is null then
    raise exception 'Este jogo não aceita mais respostas';
  end if;
  if not exists (select 1 from public.players
                  where id = p_player and group_id = r.gid and active and not pending
                    and (r.via = 'mensalistas' or kind = 'convidado')) then
    raise exception 'Jogador não encontrado neste grupo';
  end if;

  select status into atual from public.attendance
   where event_id = p_event and player_id = p_player;

  if not fechada then
    novo := p_status;
  elsif p_status = 'nao_vou' then
    novo := 'nao_vou';
  elsif atual = 'chamado' then
    novo := 'vou';
  elsif atual in ('vou', 'espera') then
    return;
  else
    novo := 'espera';
  end if;

  insert into public.attendance (event_id, player_id, status, espera_desde)
  values (p_event, p_player, novo, case when novo = 'espera' then now() end)
  on conflict (event_id, player_id) do update
    set status = excluded.status,
        espera_desde = case when excluded.status = 'espera' then now()
                            else public.attendance.espera_desde end,
        answered_at = case when public.attendance.status = excluded.status
                           then public.attendance.answered_at else now() end;
end;
$$;

-- Mesma função da 014. Com a lista fechada, quem chega entra na espera em vez
-- de ser recusado.
create or replace function public.guest_upsert_convidado(
  gid uuid, p_event uuid, p_name text, p_invited_by uuid, p_position text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare nome text; posicao text; existente public.players; v_sport text; novo uuid; qtd int;
        fechada boolean; v_status text;
begin
  nome := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  if length(nome) < 2 or length(nome) > 40 then
    raise exception 'Nome precisa ter entre 2 e 40 letras';
  end if;
  posicao := nullif(btrim(coalesce(p_position, '')), '');
  if posicao is not null and length(posicao) > 30 then
    raise exception 'Posição inválida';
  end if;
  select list_closed into fechada from public.events
   where id = p_event and group_id = gid and not closed;
  if fechada is null then
    raise exception 'Este jogo não aceita mais respostas';
  end if;
  v_status := case when fechada then 'espera' else 'vou' end;

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

  -- Quem já está (com vaga, chamado ou esperando) não perde o lugar
  insert into public.attendance (event_id, player_id, status, espera_desde)
  values (p_event, novo, v_status, case when v_status = 'espera' then now() end)
  on conflict (event_id, player_id) do update
    set status = case when public.attendance.status in ('vou', 'chamado', 'espera')
                      then public.attendance.status else excluded.status end,
        espera_desde = case when public.attendance.status in ('vou', 'chamado', 'espera')
                            then public.attendance.espera_desde else excluded.espera_desde end,
        answered_at = case when public.attendance.status in ('vou', 'chamado', 'espera')
                           then public.attendance.answered_at else now() end;
  return novo;
end;
$$;
revoke execute on function public.guest_upsert_convidado(uuid, uuid, text, uuid, text) from public, anon, authenticated;

-- Mesma função da 014; cada pessoa leva também quando entrou na espera e
-- quando foi chamada
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
               'esperaDesde', a.espera_desde,
               'chamadoEm', a.chamado_em,
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
-- Incorporado da migração 016 — avisos no celular.
-- 016 — Avisos no celular (web push)
--
-- Pedido do Guilherme em 25/09/2026, fase 2 da fila de espera. Quem ativa
-- "Me avise pelo celular" no link recebe:
--   - abriu uma vaga para você (chamado da fila de espera);
--   - jogo novo marcado (quando o jogo passa a ser o próximo, nos links);
--   - times sorteados (o seu time, quando ele é publicado ou muda);
--   - aviso manual do administrador.
-- E o administrador que ativar em Ajustes recebe: alguém saiu, aceitou ou
-- recusou a vaga, e vaga aberta sem ninguém na espera.
--
-- Como funciona: todo aviso vira uma linha em `avisos` — a caixa de saída —,
-- gravada pelos gatilhos ou pelo administrador. Um Database Webhook chama a
-- Edge Function `enviar-aviso` a cada linha nova, e ela entrega aos celulares
-- inscritos. Só entra na caixa quem tem para onde entregar.
--
-- Segurança:
--   - `push_inscricoes` e `avisos` não têm política nenhuma: só as funções
--     abaixo mexem nelas. O administrador não lê as chaves dos celulares — só
--     QUAIS atletas têm aviso (`inscritos_com_aviso`);
--   - o endereço de entrega só pode ser dos serviços de push (Google, Apple,
--     Mozilla, Microsoft). Sem isso, alguém cadastraria um endereço qualquer
--     e faria o servidor mandar requisições para ele;
--   - a Edge Function só entrega aviso que está na caixa e ainda não saiu:
--     chamá-la de fora não inventa aviso nenhum.
--
-- Horário dos avisos em America/Sao_Paulo.
--
-- Rodar uma vez no SQL Editor, DEPOIS da 015. Não apaga dados: cria duas
-- tabelas e uma coluna, e troca a função que chama o próximo da espera (ela
-- passa a devolver quem chamou) e o gatilho das respostas.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.push_inscricoes (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups on delete cascade,
  -- Atleta (pelo link) OU administrador (pela conta) — nunca os dois
  player_id  uuid references public.players on delete cascade,
  user_id    uuid references auth.users on delete cascade,
  endpoint   text not null unique
    check (length(endpoint) < 1000 and endpoint ~ ('^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com'
                                                  || '|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/')),
  p256dh     text not null check (length(p256dh) between 20 and 200),
  auth       text not null check (length(auth) between 8 and 100),
  criado_em  timestamptz not null default now(),
  check ((player_id is null) <> (user_id is null))
);
create index if not exists push_inscricoes_grupo_idx on public.push_inscricoes (group_id);
create index if not exists push_inscricoes_jogador_idx on public.push_inscricoes (player_id);
alter table public.push_inscricoes enable row level security;

create table if not exists public.avisos (
  id         bigint generated always as identity primary key,
  group_id   uuid not null references public.groups on delete cascade,
  event_id   uuid references public.events on delete set null,
  destino    text not null check (destino in ('jogador', 'admins')),
  player_id  uuid references public.players on delete cascade,
  tipo       text not null,
  titulo     text not null check (length(titulo) <= 120),
  corpo      text not null check (length(corpo) <= 400),
  -- Caminho dentro do app; o celular completa com o endereço do próprio app
  url        text not null default '/',
  criado_em  timestamptz not null default now(),
  enviado_em timestamptz,
  resultado  jsonb,
  check ((destino = 'jogador') = (player_id is not null))
);
create index if not exists avisos_pendentes_idx on public.avisos (id) where enviado_em is null;
alter table public.avisos enable row level security;

-- Jogo já anunciado aos inscritos. Os jogos que já existem contam como
-- anunciados: rodar a migração não pode disparar aviso para ninguém.
alter table public.events add column if not exists anunciado_em timestamptz;
update public.events set anunciado_em = now() where anunciado_em is null;

-- ── Textos ──

-- "sábado, 26/09 às 20:00"
create or replace function public.quando_do_jogo(p_inicio timestamptz)
returns text language sql immutable set search_path = public as $$
  select (array['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'])
           [extract(dow from p_inicio at time zone 'America/Sao_Paulo')::int + 1]
         || ', ' || to_char(p_inicio at time zone 'America/Sao_Paulo', 'DD/MM')
         || ' às ' || to_char(p_inicio at time zone 'America/Sao_Paulo', 'HH24:MI');
$$;

-- O link da pessoa, já aberto como ela (`?eu=`): mensalista pelo link dos
-- mensalistas, convidado pelo de convidados
create or replace function public.link_do_jogador(p_player uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when p.kind = 'convidado' and g.guest_code is not null
              then '/#/v/' || g.guest_code else '/#/c/' || g.invite_code end
         || '?eu=' || p.id
    from public.players p join public.groups g on g.id = p.group_id
   where p.id = p_player;
$$;
revoke execute on function public.link_do_jogador(uuid) from public, anon, authenticated;

-- Nome como o grupo conhece
create or replace function public.nome_do_jogador(p_player uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(nickname, ''), name) from public.players where id = p_player;
$$;
revoke execute on function public.nome_do_jogador(uuid) from public, anon, authenticated;

-- ── Pôr na caixa de saída — só quem tem para onde entregar ──

create or replace function public.avisar_jogador(
  p_player uuid, p_event uuid, p_tipo text, p_titulo text, p_corpo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.avisos (group_id, event_id, destino, player_id, tipo, titulo, corpo, url)
  select p.group_id, p_event, 'jogador', p.id, p_tipo, left(p_titulo, 120), left(p_corpo, 400),
         public.link_do_jogador(p.id)
    from public.players p
   where p.id = p_player and p.active and not p.pending
     and exists (select 1 from public.push_inscricoes s where s.player_id = p.id);
end;
$$;
revoke execute on function public.avisar_jogador(uuid, uuid, text, text, text) from public, anon, authenticated;

create or replace function public.avisar_admins(
  p_group uuid, p_event uuid, p_tipo text, p_titulo text, p_corpo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.push_inscricoes s
              where s.group_id = p_group and s.user_id is not null) then
    insert into public.avisos (group_id, event_id, destino, tipo, titulo, corpo, url)
    values (p_group, p_event, 'admins', p_tipo, left(p_titulo, 120), left(p_corpo, 400), '/#/amador');
  end if;
end;
$$;
revoke execute on function public.avisar_admins(uuid, uuid, text, text, text) from public, anon, authenticated;

-- ── Vaga aberta ──
-- A mesma da 015; agora avisa quem foi chamado e devolve o primeiro chamado,
-- para o gatilho contar ao administrador.
drop function if exists public.chamar_proximo(uuid, uuid);
create function public.chamar_proximo(p_event uuid, p_vaga_de uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare ev public.events; ocupadas int; prox uuid; de uuid := p_vaga_de; primeiro uuid; grupo text;
begin
  select * into ev from public.events where id = p_event;
  if ev.id is null or ev.closed or not ev.list_closed or ev.slots is null then
    return null;
  end if;
  select name into grupo from public.groups where id = ev.group_id;
  loop
    select count(*) into ocupadas
      from public.attendance a join public.players p on p.id = a.player_id
     where a.event_id = p_event and a.status in ('vou', 'chamado')
       and p.active and not p.pending;
    exit when ocupadas >= ev.slots;

    select a.player_id into prox
      from public.attendance a join public.players p on p.id = a.player_id
     where a.event_id = p_event and a.status = 'espera'
       and p.active and not p.pending
     order by (p.kind = 'convidado'), coalesce(a.espera_desde, a.answered_at), a.player_id
     limit 1;
    exit when prox is null;

    update public.attendance
       set status = 'chamado', chamado_em = now(), vaga_de = de, answered_at = now()
     where event_id = p_event and player_id = prox;
    perform public.avisar_jogador(prox, p_event, 'vaga', 'Abriu uma vaga para você!',
      grupo || ' · ' || public.quando_do_jogo(ev.starts_at)
      || '. Você era o próximo da fila de espera. Ainda quer jogar? Toque para responder.');
    primeiro := coalesce(primeiro, prox);
    de := null;
  end loop;
  return primeiro;
end;
$$;
revoke execute on function public.chamar_proximo(uuid, uuid) from public, anon, authenticated;

-- A mesma da 015, e conta ao administrador o que aconteceu com a vaga
create or replace function public.fila_ao_responder()
returns trigger language plpgsql security definer set search_path = public as $$
declare de uuid; chamado uuid; ev public.events; nome text; depois text;
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  if tg_op = 'UPDATE' then
    if old.status = 'vou' and new.status <> 'vou' then
      de := new.player_id;
    elsif old.status = 'chamado' and new.status not in ('vou', 'chamado') then
      de := old.vaga_de;
    end if;
  end if;
  chamado := public.chamar_proximo(new.event_id, de);

  if tg_op = 'UPDATE' then
    select * into ev from public.events where id = new.event_id;
    if ev.list_closed and not ev.closed then
      nome := public.nome_do_jogador(new.player_id);
      depois := case when chamado is not null
                     then public.nome_do_jogador(chamado) || ' foi chamado da fila de espera.'
                     else 'Ninguém na fila de espera: a vaga está aberta.' end;
      if old.status = 'vou' and new.status <> 'vou' then
        perform public.avisar_admins(ev.group_id, ev.id, 'saiu', nome || ' saiu do jogo', depois);
      elsif old.status = 'chamado' and new.status = 'vou' then
        perform public.avisar_admins(ev.group_id, ev.id, 'aceitou', nome || ' aceitou a vaga',
          'Já está na lista do jogo de ' || public.quando_do_jogo(ev.starts_at) || '.');
      elsif old.status = 'chamado' and new.status = 'nao_vou' then
        perform public.avisar_admins(ev.group_id, ev.id, 'recusou', nome || ' não pode jogar', depois);
      end if;
    end if;
  end if;
  return null;
end;
$$;

-- ── Jogo novo marcado ──
-- O próximo jogo do grupo (a regra do link) é anunciado uma vez só. Roda
-- quando um jogo é criado, muda de data ou de status — e pelo administrador,
-- a cada sincronização, para pegar o jogo que virou o próximo porque o
-- anterior passou da janela de 12 h.
create or replace function public.anunciar_proximo(p_group uuid)
returns void language plpgsql security definer set search_path = public as $$
declare ev public.events; grupo text;
begin
  select * into ev from public.events
   where group_id = p_group and not closed
     and starts_at >= now() - interval '12 hours'
   order by starts_at asc limit 1;
  if ev.id is null or ev.anunciado_em is not null then
    return;
  end if;
  update public.events set anunciado_em = now() where id = ev.id;
  select name into grupo from public.groups where id = p_group;

  insert into public.avisos (group_id, event_id, destino, player_id, tipo, titulo, corpo, url)
  select p_group, ev.id, 'jogador', p.id, 'jogo',
         left('Jogo marcado: ' || public.quando_do_jogo(ev.starts_at), 120),
         left(grupo || coalesce(' · ' || nullif(ev.location, ''), '') || '. Vai? Toque para responder.', 400),
         public.link_do_jogador(p.id)
    from public.players p
   where p.group_id = p_group and p.active and not p.pending
     and exists (select 1 from public.push_inscricoes s where s.player_id = p.id);
end;
$$;
revoke execute on function public.anunciar_proximo(uuid) from public, anon, authenticated;

create or replace function public.anuncio_ao_mudar_jogo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.anunciar_proximo(new.group_id);
  return null;
end;
$$;

drop trigger if exists events_anuncio on public.events;
create trigger events_anuncio
  after insert or update of status, starts_at, closed on public.events
  for each row execute function public.anuncio_ao_mudar_jogo();

-- Chamada pelo app do administrador a cada sincronização
create or replace function public.anunciar_jogo(p_group uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_group(p_group) then
    raise exception 'Sem permissão neste grupo';
  end if;
  perform public.anunciar_proximo(p_group);
end;
$$;
revoke execute on function public.anunciar_jogo(uuid) from public, anon;
grant  execute on function public.anunciar_jogo(uuid) to authenticated;

-- ── Times sorteados ──
-- Só quem mudou de lugar é avisado: republicar depois de encaixar um
-- substituto não pode avisar o time inteiro de novo.
create or replace function public.time_de(p_teams jsonb, p_player text)
returns text language sql immutable set search_path = public as $$
  select coalesce(
    (select t ->> 'name' from jsonb_array_elements(coalesce(p_teams -> 'teams', '[]'::jsonb)) t
      where t -> 'players' ? p_player limit 1),
    case when coalesce(p_teams -> 'bench', '[]'::jsonb) ? p_player then 'reservas' end);
$$;

create or replace function public.avisar_times()
returns trigger language plpgsql security definer set search_path = public as $$
declare pid text; onde text; grupo text; quando text;
begin
  if new.teams is null then
    return null;
  end if;
  select name into grupo from public.groups where id = new.group_id;
  quando := public.quando_do_jogo(new.starts_at);
  for pid in
    select jsonb_array_elements_text(t -> 'players')
      from jsonb_array_elements(coalesce(new.teams -> 'teams', '[]'::jsonb)) t
    union all
    select jsonb_array_elements_text(coalesce(new.teams -> 'bench', '[]'::jsonb))
  loop
    onde := public.time_de(new.teams, pid);
    continue when onde is not distinct from public.time_de(old.teams, pid);
    perform public.avisar_jogador(pid::uuid, new.id, 'times',
      case when onde = 'reservas' then 'Times sorteados: você começa como reserva'
           else 'Times sorteados: você está no ' || onde end,
      grupo || ' · ' || quando || '. Toque para ver os times.');
  end loop;
  return null;
end;
$$;

drop trigger if exists events_times on public.events;
create trigger events_times
  after update of teams on public.events
  for each row execute function public.avisar_times();

-- ── Aviso manual do administrador ──
create or replace function public.avisar_inscritos(p_group uuid, p_texto text)
returns int language plpgsql security definer set search_path = public as $$
declare texto text; grupo text; n int;
begin
  if not public.can_manage_group(p_group) then
    raise exception 'Sem permissão neste grupo';
  end if;
  texto := btrim(coalesce(p_texto, ''));
  if length(texto) < 2 or length(texto) > 300 then
    raise exception 'O aviso precisa ter entre 2 e 300 letras';
  end if;
  select name into grupo from public.groups where id = p_group;
  insert into public.avisos (group_id, destino, player_id, tipo, titulo, corpo, url)
  select p_group, 'jogador', p.id, 'manual', left(grupo, 120), texto, public.link_do_jogador(p.id)
    from public.players p
   where p.group_id = p_group and p.active and not p.pending
     and exists (select 1 from public.push_inscricoes s where s.player_id = p.id);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.avisar_inscritos(uuid, text) from public, anon;
grant  execute on function public.avisar_inscritos(uuid, text) to authenticated;

-- Quais atletas do grupo têm aviso ativado — sem as chaves
create or replace function public.inscritos_com_aviso(p_group uuid)
returns setof uuid language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_manage_group(p_group) then
    raise exception 'Sem permissão neste grupo';
  end if;
  return query select distinct s.player_id from public.push_inscricoes s
                where s.group_id = p_group and s.player_id is not null;
end;
$$;
revoke execute on function public.inscritos_com_aviso(uuid) from public, anon;
grant  execute on function public.inscritos_com_aviso(uuid) to authenticated;

-- ── Inscrever e cancelar ──

-- O atleta, pelo link. Um celular é de uma pessoa por vez: o mesmo endereço
-- passa para quem se inscreveu por último. Até 5 aparelhos por pessoa.
create or replace function public.guest_inscrever_aviso(
  code text, p_player uuid, p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from public.guest_resolve(code);
  if not exists (select 1 from public.players
                  where id = p_player and group_id = r.gid and active and not pending
                    and (r.via = 'mensalistas' or kind = 'convidado')) then
    raise exception 'Jogador não encontrado neste grupo';
  end if;
  insert into public.push_inscricoes (group_id, player_id, endpoint, p256dh, auth)
  values (r.gid, p_player, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set group_id = excluded.group_id, player_id = excluded.player_id, user_id = null,
        p256dh = excluded.p256dh, auth = excluded.auth, criado_em = now();
  delete from public.push_inscricoes
   where id in (select id from public.push_inscricoes where player_id = p_player
                 order by criado_em desc offset 5);
end;
$$;
revoke execute on function public.guest_inscrever_aviso(text, uuid, text, text, text) from public;
grant  execute on function public.guest_inscrever_aviso(text, uuid, text, text, text) to anon, authenticated;

create or replace function public.guest_cancelar_aviso(code text, p_endpoint text)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from public.guest_resolve(code);
  delete from public.push_inscricoes
   where endpoint = p_endpoint and group_id = r.gid and player_id is not null;
end;
$$;
revoke execute on function public.guest_cancelar_aviso(text, text) from public;
grant  execute on function public.guest_cancelar_aviso(text, text) to anon, authenticated;

-- O administrador, pela conta
create or replace function public.inscrever_admin(
  p_group uuid, p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_group(p_group) then
    raise exception 'Sem permissão neste grupo';
  end if;
  insert into public.push_inscricoes (group_id, user_id, endpoint, p256dh, auth)
  values (p_group, auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set group_id = excluded.group_id, user_id = excluded.user_id, player_id = null,
        p256dh = excluded.p256dh, auth = excluded.auth, criado_em = now();
  delete from public.push_inscricoes
   where id in (select id from public.push_inscricoes where user_id = auth.uid()
                 order by criado_em desc offset 5);
end;
$$;
revoke execute on function public.inscrever_admin(uuid, text, text, text) from public, anon;
grant  execute on function public.inscrever_admin(uuid, text, text, text) to authenticated;

create or replace function public.cancelar_aviso_admin(p_endpoint text)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.push_inscricoes where endpoint = p_endpoint and user_id = auth.uid();
end;
$$;
revoke execute on function public.cancelar_aviso_admin(text) from public, anon;
grant  execute on function public.cancelar_aviso_admin(text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- Incorporado da migração 017 — financeiro.
-- 017 — Financeiro (fase 1)
--
-- Desenho aprovado pelo Guilherme em 29/09/2026:
--   - mensalista paga valor fixo por mês, com dia de vencimento; a cobrança
--     nasce sozinha no começo do mês (`gerar_mensalidades`);
--   - convidado paga diária pelo jogo em que entrou; a cobrança nasce ao
--     encerrar o jogo, com um toque do administrador (`lancar_diarias`);
--   - despesas (quadra, bola) só saem do caixa, ninguém é cobrado;
--   - a cobrança pelo WhatsApp leva o Pix copia e cola (gerado no app a
--     partir da chave Pix do grupo, sem integração com banco).
--
-- Regras de dinheiro:
--   - sempre em centavos inteiros;
--   - NADA se apaga: as tabelas não têm permissão de apagar nem de editar.
--     Pagamento e despesa errados ganham um ESTORNO (linha negativa
--     visível, `estorno_de`); cobrança indevida é CANCELADA, com quem e
--     quando. Com dinheiro de grupo, é isso que mantém a confiança.
--   - só o dono e os administradores leem e escrevem (`can_manage_group`);
--     os links dos atletas não veem nada daqui.
--
-- As tabelas antigas `payments` e `expenses`, nunca usadas, ficam paradas.
--
-- Rodar uma vez no SQL Editor, DEPOIS da 016. Não apaga dados: acrescenta
-- colunas em `groups` e cria três tabelas e sete funções.
-- ─────────────────────────────────────────────────────────────

-- ── Configuração do grupo ──
-- Os limites do Pix são os do padrão do Banco Central (BR Code): nome até
-- 25 letras, cidade até 15, chave até 77.
alter table public.groups
  add column if not exists mensalidade_cents int
    check (mensalidade_cents is null or mensalidade_cents between 1 and 10000000),
  add column if not exists mensalidade_dia smallint
    check (mensalidade_dia is null or mensalidade_dia between 1 and 28),
  add column if not exists diaria_cents int
    check (diaria_cents is null or diaria_cents between 1 and 10000000),
  add column if not exists pix_chave text check (pix_chave is null or length(pix_chave) <= 77),
  add column if not exists pix_nome text check (pix_nome is null or length(pix_nome) <= 25),
  add column if not exists pix_cidade text check (pix_cidade is null or length(pix_cidade) <= 15);

-- ── O que cada um deve ──
create table if not exists public.cobrancas (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups on delete cascade,
  -- Sem cascata: histórico de dinheiro não some junto com um cadastro
  player_id    uuid not null references public.players,
  tipo         text not null check (tipo in ('mensalidade', 'diaria', 'avulsa')),
  -- 'AAAA-MM' na mensalidade, o id do jogo na diária, um id novo na avulsa.
  -- É o que impede a mesma cobrança de nascer duas vezes
  referencia   text not null,
  descricao    text not null check (length(descricao) between 1 and 80),
  valor_cents  int not null check (valor_cents between 1 and 10000000),
  vence_em     date not null,
  event_id     uuid references public.events on delete set null,
  criada_em    timestamptz not null default now(),
  criada_por   uuid references auth.users on delete set null default auth.uid(),
  cancelada_em  timestamptz,
  cancelada_por uuid references auth.users on delete set null,
  unique (group_id, player_id, tipo, referencia)
);
create index if not exists cobrancas_grupo_idx on public.cobrancas (group_id, vence_em);
alter table public.cobrancas enable row level security;

-- ── O que entrou ──
-- Pagamento é do JOGADOR, não de uma cobrança: abate as dívidas mais antigas
-- primeiro (o app mostra assim). Estorno = linha negativa apontando a original.
create table if not exists public.pagamentos (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups on delete cascade,
  player_id   uuid not null references public.players,
  valor_cents int not null check (valor_cents <> 0 and abs(valor_cents) <= 10000000),
  metodo      text not null check (metodo in ('pix', 'dinheiro')),
  pago_em     date not null,
  obs         text check (obs is null or length(obs) <= 120),
  estorno_de  uuid references public.pagamentos on delete restrict,
  criado_em   timestamptz not null default now(),
  criado_por  uuid references auth.users on delete set null default auth.uid(),
  check ((valor_cents < 0) = (estorno_de is not null))
);
create index if not exists pagamentos_grupo_idx on public.pagamentos (group_id, pago_em);
create unique index if not exists pagamentos_um_estorno on public.pagamentos (estorno_de) where estorno_de is not null;
alter table public.pagamentos enable row level security;

-- ── O que saiu ──
create table if not exists public.despesas (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups on delete cascade,
  descricao   text not null check (length(descricao) between 1 and 80),
  valor_cents int not null check (valor_cents <> 0 and abs(valor_cents) <= 10000000),
  gasto_em    date not null,
  estorno_de  uuid references public.despesas on delete restrict,
  criado_em   timestamptz not null default now(),
  criado_por  uuid references auth.users on delete set null default auth.uid(),
  check ((valor_cents < 0) = (estorno_de is not null))
);
create index if not exists despesas_grupo_idx on public.despesas (group_id, gasto_em);
create unique index if not exists despesas_um_estorno on public.despesas (estorno_de) where estorno_de is not null;
alter table public.despesas enable row level security;

-- Ler: só quem administra o grupo. Gravar pagamento e despesa direto é
-- permitido, mas só POSITIVO e de jogador do próprio grupo; estorno e tudo de
-- cobrança passam pelas funções abaixo. Sem política de editar nem de apagar.
drop policy if exists cobrancas_ler on public.cobrancas;
create policy cobrancas_ler on public.cobrancas
  for select using (public.can_manage_group(group_id));

drop policy if exists pagamentos_ler on public.pagamentos;
create policy pagamentos_ler on public.pagamentos
  for select using (public.can_manage_group(group_id));
drop policy if exists pagamentos_lancar on public.pagamentos;
create policy pagamentos_lancar on public.pagamentos
  for insert with check (
    public.can_manage_group(group_id) and valor_cents > 0 and estorno_de is null
    and exists (select 1 from public.players p where p.id = player_id and p.group_id = pagamentos.group_id));

drop policy if exists despesas_ler on public.despesas;
create policy despesas_ler on public.despesas
  for select using (public.can_manage_group(group_id));
drop policy if exists despesas_lancar on public.despesas;
create policy despesas_lancar on public.despesas
  for insert with check (public.can_manage_group(group_id) and valor_cents > 0 and estorno_de is null);

-- ── Nomes dos meses, para a descrição da mensalidade ──
create or replace function public.nome_do_mes(p_mes int)
returns text language sql immutable set search_path = public as $$
  select (array['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
                'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'])[p_mes];
$$;

-- ── Mensalidade do mês corrente ──
-- Uma por mensalista ativo, uma vez só (a chave única segura dois
-- administradores abrindo o app juntos). Roda a cada sincronização do app do
-- administrador. Mês sem ninguém abrir o app não é gerado depois.
-- Devolve quantas cobranças nasceram agora.
create or replace function public.gerar_mensalidades(p_group uuid)
returns int language plpgsql security definer set search_path = public as $$
declare g public.groups; hoje date; ref text; vence date; n int;
begin
  if not public.can_manage_group(p_group) then
    raise exception 'Sem permissão neste grupo';
  end if;
  select * into g from public.groups where id = p_group;
  if g.mensalidade_cents is null or g.mensalidade_dia is null then
    return 0;
  end if;
  hoje := (now() at time zone 'America/Sao_Paulo')::date;
  ref := to_char(hoje, 'YYYY-MM');
  vence := make_date(extract(year from hoje)::int, extract(month from hoje)::int, g.mensalidade_dia);

  insert into public.cobrancas (group_id, player_id, tipo, referencia, descricao, valor_cents, vence_em)
  select p_group, p.id, 'mensalidade', ref,
         'Mensalidade de ' || public.nome_do_mes(extract(month from hoje)::int),
         g.mensalidade_cents, vence
    from public.players p
   where p.group_id = p_group and p.active and not p.pending and p.deleted_at is null
     and p.kind = 'mensalista'
  on conflict (group_id, player_id, tipo, referencia) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.gerar_mensalidades(uuid) from public, anon;
grant  execute on function public.gerar_mensalidades(uuid) to authenticated;

-- ── Diária dos convidados de um jogo ──
-- O administrador confirma quem jogou; o mesmo jogo não cobra duas vezes a
-- mesma pessoa. Devolve quantas cobranças nasceram agora.
create or replace function public.lancar_diarias(p_event uuid, p_players uuid[], p_valor_cents int)
returns int language plpgsql security definer set search_path = public as $$
declare ev public.events; dia date; n int;
begin
  select * into ev from public.events where id = p_event;
  if ev.id is null or not public.can_manage_group(ev.group_id) then
    raise exception 'Sem permissão neste grupo';
  end if;
  if p_valor_cents is null or p_valor_cents < 1 or p_valor_cents > 10000000 then
    raise exception 'Valor da diária inválido';
  end if;
  dia := (ev.starts_at at time zone 'America/Sao_Paulo')::date;

  insert into public.cobrancas (group_id, player_id, tipo, referencia, descricao, valor_cents, vence_em, event_id)
  select ev.group_id, p.id, 'diaria', ev.id::text,
         'Diária do jogo de ' || to_char(dia, 'DD/MM'), p_valor_cents, dia, ev.id
    from public.players p
   where p.id = any(p_players) and p.group_id = ev.group_id
  on conflict (group_id, player_id, tipo, referencia) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.lancar_diarias(uuid, uuid[], int) from public, anon;
grant  execute on function public.lancar_diarias(uuid, uuid[], int) to authenticated;

-- ── Cobrança avulsa (camisa, churrasco) ──
create or replace function public.lancar_avulsa(
  p_player uuid, p_descricao text, p_valor_cents int, p_vence_em date)
returns uuid language plpgsql security definer set search_path = public as $$
declare gid uuid; novo uuid;
begin
  select group_id into gid from public.players where id = p_player;
  if gid is null or not public.can_manage_group(gid) then
    raise exception 'Sem permissão neste grupo';
  end if;
  insert into public.cobrancas (group_id, player_id, tipo, referencia, descricao, valor_cents, vence_em)
  values (gid, p_player, 'avulsa', gen_random_uuid()::text, btrim(p_descricao), p_valor_cents,
          coalesce(p_vence_em, (now() at time zone 'America/Sao_Paulo')::date))
  returning id into novo;
  return novo;
end;
$$;
revoke execute on function public.lancar_avulsa(uuid, text, int, date) from public, anon;
grant  execute on function public.lancar_avulsa(uuid, text, int, date) to authenticated;

-- ── Cancelar cobrança: fica visível, com quem e quando ──
create or replace function public.cancelar_cobranca(p_cobranca uuid)
returns void language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  select group_id into gid from public.cobrancas where id = p_cobranca;
  if gid is null or not public.can_manage_group(gid) then
    raise exception 'Sem permissão neste grupo';
  end if;
  update public.cobrancas set cancelada_em = now(), cancelada_por = auth.uid()
   where id = p_cobranca and cancelada_em is null;
end;
$$;
revoke execute on function public.cancelar_cobranca(uuid) from public, anon;
grant  execute on function public.cancelar_cobranca(uuid) to authenticated;

-- ── Estornos: uma linha negativa, uma vez só ──
create or replace function public.estornar_pagamento(p_pagamento uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare o public.pagamentos; novo uuid;
begin
  select * into o from public.pagamentos where id = p_pagamento;
  if o.id is null or not public.can_manage_group(o.group_id) then
    raise exception 'Sem permissão neste grupo';
  end if;
  if o.valor_cents < 0 then
    raise exception 'Estorno não se estorna';
  end if;
  insert into public.pagamentos (group_id, player_id, valor_cents, metodo, pago_em, obs, estorno_de)
  values (o.group_id, o.player_id, -o.valor_cents, o.metodo,
          (now() at time zone 'America/Sao_Paulo')::date, 'Estorno', o.id)
  returning id into novo;
  return novo;
exception when unique_violation then
  raise exception 'Este pagamento já foi estornado';
end;
$$;
revoke execute on function public.estornar_pagamento(uuid) from public, anon;
grant  execute on function public.estornar_pagamento(uuid) to authenticated;

create or replace function public.estornar_despesa(p_despesa uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare o public.despesas; novo uuid;
begin
  select * into o from public.despesas where id = p_despesa;
  if o.id is null or not public.can_manage_group(o.group_id) then
    raise exception 'Sem permissão neste grupo';
  end if;
  if o.valor_cents < 0 then
    raise exception 'Estorno não se estorna';
  end if;
  insert into public.despesas (group_id, descricao, valor_cents, gasto_em, estorno_de)
  values (o.group_id, left('Estorno: ' || o.descricao, 80), -o.valor_cents,
          (now() at time zone 'America/Sao_Paulo')::date, o.id)
  returning id into novo;
  return novo;
exception when unique_violation then
  raise exception 'Esta despesa já foi estornada';
end;
$$;
revoke execute on function public.estornar_despesa(uuid) from public, anon;
grant  execute on function public.estornar_despesa(uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- Incorporado da migração 018 — saldo inicial do caixa.
-- 018 — Saldo inicial do caixa
--
-- Pedido do Guilherme em 29/09/2026: o grupo já tinha dinheiro (ou dívida)
-- quando começou a usar o app. Com o saldo inicial e a data dele, o
-- Financeiro mostra quanto há EM CAIXA:
--
--   em caixa = saldo inicial + o que entrou − o que saiu, a partir da data
--
-- Pagamentos e despesas antes da data não entram: já estão no saldo inicial.
-- Pode ser negativo — o grupo que começa devendo a quadra.
--
-- Rodar uma vez no SQL Editor, DEPOIS da 017. Não apaga dados: acrescenta
-- duas colunas em `groups`. Quem grava é o dono ou um administrador, pela
-- política que já existe (groups_manage).
-- ─────────────────────────────────────────────────────────────

alter table public.groups
  add column if not exists caixa_inicial_cents int
    check (caixa_inicial_cents is null or caixa_inicial_cents between -100000000 and 100000000),
  add column if not exists caixa_inicial_em date;


-- ─────────────────────────────────────────────────────────────
-- Incorporado da migração 019 — cobrança do convidado.
-- 019 — Cobrança do convidado: por jogo, antecipada ou depois
--
-- Pedido do Guilherme em 29/09/2026:
--   - cada jogo nasce COM ou SEM cobrança de diária (`events.cobra_diaria`)
--     — um amistoso ou um treino sai sem;
--   - em Ajustes, o grupo escolhe se a diária é cobrada ANTECIPADA ou
--     depois do jogo (`groups.diaria_antecipada`).
--
-- Antecipada, decidido com ele:
--   - a diária nasce quando o convidado GANHA A VAGA (não na fila, não na
--     lista de espera) — ninguém paga para esperar;
--   - perdeu a vaga antes do jogo (desistiu, voltou para a fila): a diária
--     daquele jogo é cancelada sozinha. Se ele já tinha pago, o dinheiro fica
--     como crédito, e o administrador decide no Financeiro se deixa de crédito
--     ou devolve (estorno);
--   - voltou a ganhar a vaga: a mesma diária é reativada, não nasce outra;
--   - cancelamento feito À MÃO pelo administrador nunca é desfeito;
--   - com o jogo encerrado ou cancelado, nada mais muda sozinho.
--
-- Quem calcula a vaga é `convidados_com_vaga`, a mesma regra de
-- `distribuirVagas` do app (lib/vagas.ts): mensalista confirmado sempre joga,
-- o chamado da lista de espera tem a vaga reservada, e os convidados entram
-- por ordem de resposta até acabarem as vagas.
--
-- Depois do jogo, como antes: ao encerrar, o administrador confirma quem
-- jogou (`lancar_diarias`) — agora só nos jogos com cobrança.
--
-- Rodar uma vez no SQL Editor, DEPOIS da 018. Não apaga dados: acrescenta
-- duas colunas, cria três funções e dois gatilhos, e troca `salvar_jogos` e
-- `guest_group`.
-- ─────────────────────────────────────────────────────────────

alter table public.groups
  add column if not exists diaria_antecipada boolean not null default false;
alter table public.events
  add column if not exists cobra_diaria boolean not null default true;

-- Mesma função da 014; agora grava também se o jogo cobra diária
create or replace function public.salvar_jogos(p_group uuid, p_rows jsonb)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not public.can_manage_group(p_group) then
    raise exception 'Sem permissão neste grupo';
  end if;
  insert into public.events as e
    (id, group_id, title, starts_at, location, slots, sport, status, closed, sorteio, cobra_diaria, updated_at)
  select r.id, p_group, r.title, r.starts_at, r.location, r.slots,
         coalesce(r.sport, (select g.sport from public.groups g where g.id = p_group)),
         coalesce(r.status, 'programado'), coalesce(r.status, 'programado') <> 'programado',
         r.sorteio, coalesce(r.cobra_diaria, true), r.updated_at
    from jsonb_to_recordset(p_rows) as r(
           id uuid, title text, starts_at timestamptz, location text, slots int,
           sport text, status text, sorteio jsonb, cobra_diaria boolean, updated_at timestamptz)
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
    updated_at   = excluded.updated_at
  where e.group_id = p_group
    and e.updated_at < excluded.updated_at;
end;
$$;
revoke execute on function public.salvar_jogos(uuid, jsonb) from public, anon;
grant  execute on function public.salvar_jogos(uuid, jsonb) to authenticated;

-- ── Quem tem vaga: a regra de distribuirVagas, em SQL ──
create or replace function public.convidados_com_vaga(p_event uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  with ev as (select slots from public.events where id = p_event),
  ativos as (
    select a.player_id, a.status, a.answered_at, p.kind
      from public.attendance a join public.players p on p.id = a.player_id
     where a.event_id = p_event and p.active and not p.pending
  ),
  reservadas as (
    select count(*) filter (where status = 'vou' and kind = 'mensalista')
         + count(*) filter (where status = 'chamado') as n
      from ativos
  ),
  convidados as (
    select player_id, row_number() over (order by answered_at, player_id) as ordem
      from ativos where status = 'vou' and kind = 'convidado'
  )
  select c.player_id
    from convidados c, ev, reservadas r
   where ev.slots is null or c.ordem <= greatest(0, ev.slots - r.n);
$$;
revoke execute on function public.convidados_com_vaga(uuid) from public, anon, authenticated;

-- ── A diária antecipada acompanha a vaga ──
create or replace function public.sincronizar_diarias(p_event uuid)
returns void language plpgsql security definer set search_path = public as $$
declare ev public.events; g public.groups; dia date;
begin
  select * into ev from public.events where id = p_event;
  if ev.id is null or ev.closed or ev.status <> 'programado' or not ev.cobra_diaria then
    return;
  end if;
  select * into g from public.groups where id = ev.group_id;
  if not g.diaria_antecipada or g.diaria_cents is null then
    return;
  end if;
  dia := (ev.starts_at at time zone 'America/Sao_Paulo')::date;

  -- Voltou a ter vaga: reativa a diária que o SISTEMA cancelou (a cancelada
  -- à mão pelo administrador tem cancelada_por e fica cancelada)
  update public.cobrancas c
     set cancelada_em = null
   where c.group_id = ev.group_id and c.tipo = 'diaria' and c.referencia = ev.id::text
     and c.cancelada_em is not null and c.cancelada_por is null
     and c.player_id in (select public.convidados_com_vaga(ev.id));

  -- Ganhou a vaga: nasce a diária (uma por jogo, pela chave única)
  insert into public.cobrancas
    (group_id, player_id, tipo, referencia, descricao, valor_cents, vence_em, event_id, criada_por)
  select ev.group_id, v, 'diaria', ev.id::text,
         'Diária do jogo de ' || to_char(dia, 'DD/MM'), g.diaria_cents, dia, ev.id, null
    from public.convidados_com_vaga(ev.id) v
  on conflict (group_id, player_id, tipo, referencia) do nothing;

  -- Perdeu a vaga antes do jogo: cancela, pelo sistema (cancelada_por nulo)
  update public.cobrancas c
     set cancelada_em = now(), cancelada_por = null
   where c.group_id = ev.group_id and c.tipo = 'diaria' and c.referencia = ev.id::text
     and c.cancelada_em is null
     and c.player_id not in (select public.convidados_com_vaga(ev.id));
end;
$$;
revoke execute on function public.sincronizar_diarias(uuid) from public, anon, authenticated;

-- Toda resposta e toda mudança no jogo podem mudar quem tem vaga. Os nomes
-- terminam em "zz" de propósito: os gatilhos da mesma tabela rodam em ordem
-- alfabética, e este tem de ver a fila de espera já resolvida (015).
create or replace function public.diarias_ao_responder()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  perform public.sincronizar_diarias(new.event_id);
  return null;
end;
$$;
drop trigger if exists attendance_zz_diarias on public.attendance;
create trigger attendance_zz_diarias
  after insert or update on public.attendance
  for each row execute function public.diarias_ao_responder();

create or replace function public.diarias_ao_mudar_jogo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  perform public.sincronizar_diarias(new.id);
  return null;
end;
$$;
drop trigger if exists events_zz_diarias on public.events;
create trigger events_zz_diarias
  after update of slots, list_closed, cobra_diaria, status on public.events
  for each row execute function public.diarias_ao_mudar_jogo();

-- Pela sincronização do administrador: pega o grupo que acabou de ligar a
-- cobrança antecipada, com jogos que já tinham gente confirmada
create or replace function public.sincronizar_diarias_do_grupo(p_group uuid)
returns void language plpgsql security definer set search_path = public as $$
declare ev record;
begin
  if not public.can_manage_group(p_group) then
    raise exception 'Sem permissão neste grupo';
  end if;
  for ev in select id from public.events
             where group_id = p_group and not closed and status = 'programado'
  loop
    perform public.sincronizar_diarias(ev.id);
  end loop;
end;
$$;
revoke execute on function public.sincronizar_diarias_do_grupo(uuid) from public, anon;
grant  execute on function public.sincronizar_diarias_do_grupo(uuid) to authenticated;

-- ── O link mostra o preço e o Pix, quando a diária é antecipada ──
-- Mesma função da 015; o jogo leva `cobrancaAntecipada` com o valor da
-- diária e o Pix do grupo. Nenhuma dívida de ninguém sai daqui.
create or replace function public.guest_group(code text)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare r record; g public.groups; ev public.events; v_sport text; antecipada boolean;
begin
  select * into r from public.guest_resolve(code);
  select * into g from public.groups where id = r.gid;

  select * into ev from public.events
   where group_id = g.id and not closed
     and starts_at >= now() - interval '12 hours'
   order by starts_at asc limit 1;

  v_sport := coalesce(ev.sport, g.sport);
  antecipada := ev.id is not null and ev.cobra_diaria and g.diaria_antecipada and g.diaria_cents is not null;

  return jsonb_build_object(
    'via', r.via,
    'group', jsonb_build_object('name', g.name, 'sport', v_sport, 'mode', g.mode),
    'event', case when ev.id is null then null else jsonb_build_object(
      'id', ev.id, 'title', ev.title, 'startsAt', ev.starts_at,
      'slots', ev.slots, 'location', ev.location,
      'listClosed', ev.list_closed, 'teams', ev.teams,
      'cobrancaAntecipada', case when antecipada then jsonb_build_object(
        'diariaCents', g.diaria_cents,
        'pixChave', g.pix_chave, 'pixNome', g.pix_nome, 'pixCidade', g.pix_cidade) end) end,
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id,
               'name', coalesce(nullif(p.nickname, ''), p.name),
               'kind', p.kind,
               'position', p.positions ->> v_sport,
               'status', case when a.status = 'sem_resposta' then null else a.status end,
               'answeredAt', a.answered_at,
               'esperaDesde', a.espera_desde,
               'chamadoEm', a.chamado_em,
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
-- Incorporado da migração 020 — histórico de cobranças enviadas.
-- ─────────────────────────────────────────────────────────────

-- 020 · Histórico de cobranças enviadas
--
-- Pedido do Guilherme em 29/09/2026: "deveria ter um histórico de quem eu já
-- enviei a cobrança, para não ficar cobrando e fica chato".
--
-- Uma linha a cada vez que o administrador ABRE o WhatsApp com a cobrança —
-- o app não tem como saber se ele apertou Enviar. Fica na nuvem, e não no
-- aparelho, para que um administrador veja o que o outro já cobrou.
--
--   - canal 'individual': a mensagem para a pessoa (com o Pix);
--   - canal 'grupo': a pessoa estava na lista da mensagem do grupo.
--
-- Como o resto do financeiro: só quem administra lê e grava, e nada se edita
-- nem se apaga.

create table if not exists public.lembretes (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups on delete cascade,
  player_id   uuid not null references public.players,
  canal       text not null check (canal in ('individual', 'grupo')),
  -- Quanto a pessoa devia quando foi cobrada
  valor_cents int not null check (valor_cents > 0 and valor_cents <= 10000000),
  enviado_em  timestamptz not null default now(),
  enviado_por uuid references auth.users on delete set null default auth.uid()
);
create index if not exists lembretes_grupo_idx on public.lembretes (group_id, enviado_em);
alter table public.lembretes enable row level security;

drop policy if exists lembretes_ler on public.lembretes;
create policy lembretes_ler on public.lembretes
  for select using (public.can_manage_group(group_id));
drop policy if exists lembretes_registrar on public.lembretes;
create policy lembretes_registrar on public.lembretes
  for insert with check (
    public.can_manage_group(group_id)
    and exists (select 1 from public.players p where p.id = player_id and p.group_id = lembretes.group_id));

-- ─────────────────────────────────────────────────────────────
-- Incorporado da migração 021 — plano grátis e plano pago.
-- ─────────────────────────────────────────────────────────────

-- 021 · Plano grátis e plano pago (fase 1: o plano e as travas, sem cobrança)
--
-- Decidido pelo Guilherme em 29/09/2026:
--
--   - o plano é do GRUPO e quem paga é o organizador (R$ 14,90/mês, Mercado
--     Pago na fase 2);
--   - o pago libera o Financeiro, mais de um administrador e mais de 20
--     mensalistas (convidados não contam);
--   - todo grupo começa com 30 dias do pago; os que já existem ganham os 30
--     dias a partir desta migração; os do Guilherme ficam de cortesia;
--   - quando o plano acaba, NADA SE PERDE, SÓ TRAVA: o Financeiro fica só
--     para ler, o administrador extra vê mas não edita, e não entra o 21º
--     mensalista. Assinou de novo, volta tudo.
--
-- As travas moram no banco, e não só na tela: a tela esconde o botão, o banco
-- é quem garante.

-- ── O plano do grupo ──
alter table public.groups
  -- Fim do teste grátis. A coluna nova preenche os grupos que já existem com
  -- o mesmo "agora + 30 dias": o teste deles começa hoje
  add column if not exists teste_ate timestamptz default (now() + interval '30 days'),
  -- Pago até: quem preenche é o Mercado Pago, pela Edge Function (fase 2)
  add column if not exists pago_ate  timestamptz,
  -- Liberado para sempre, à mão, pelo SQL Editor
  add column if not exists cortesia  boolean not null default false;

-- O grupo não mexe no próprio plano. Quem entra pelo app (anon ou
-- authenticated) cria o grupo sempre com o teste padrão e nunca altera as três
-- colunas; o SQL Editor (postgres) e a Edge Function (service_role) podem.
create or replace function public.proteger_plano()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.teste_ate := now() + interval '30 days';
    new.pago_ate  := null;
    new.cortesia  := false;
  elsif (new.teste_ate, new.pago_ate, new.cortesia)
        is distinct from (old.teste_ate, old.pago_ate, old.cortesia) then
    raise exception 'O plano do grupo só muda pela assinatura.';
  end if;
  return new;
end;
$$;
drop trigger if exists groups_proteger_plano on public.groups;
create trigger groups_proteger_plano
  before insert or update on public.groups
  for each row execute function public.proteger_plano();

-- Está no pago? Cortesia, assinatura em dia, ou ainda no teste. O modo
-- profissional fica fora: o plano decidido é o da pelada, e o técnico
-- convidado de um time não pode perder a edição por um plano que não é dele
create or replace function public.grupo_premium(gid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((
    select g.mode = 'profissional'
        or g.cortesia
        or coalesce(g.pago_ate > now(), false)
        or coalesce(g.teste_ate > now(), false)
      from public.groups g where g.id = gid), false);
$$;
revoke execute on function public.grupo_premium(uuid) from public, anon;
grant  execute on function public.grupo_premium(uuid) to authenticated;

-- ── Administrador extra: vê sempre, edita só com o plano ──
-- A regra de LER quem é administrador (dono ou organizador), como era a
-- can_manage_group até aqui. Serve ao Financeiro: lá "membro" não basta — o
-- papel 'jogador' também é membro e não pode ver dinheiro de ninguém.
create or replace function public.e_admin_do_grupo(gid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid() and role in ('dono', 'organizador'));
$$;
revoke execute on function public.e_admin_do_grupo(uuid) from public, anon;
grant  execute on function public.e_admin_do_grupo(uuid) to authenticated;

-- A regra de EDITAR. Todas as políticas de escrita e as funções salvar_*
-- já passam por aqui; as leituras usam is_group_member, que não muda. Por
-- isso trocar o corpo desta função basta: o dono edita sempre, o organizador
-- só com o plano.
create or replace function public.can_manage_group(gid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid()
      and (role = 'dono' or (role = 'organizador' and public.grupo_premium(gid))));
$$;

-- O Financeiro continua legível para todo administrador, com ou sem plano
drop policy if exists cobrancas_ler on public.cobrancas;
create policy cobrancas_ler on public.cobrancas
  for select using (public.e_admin_do_grupo(group_id));
drop policy if exists pagamentos_ler on public.pagamentos;
create policy pagamentos_ler on public.pagamentos
  for select using (public.e_admin_do_grupo(group_id));
drop policy if exists despesas_ler on public.despesas;
create policy despesas_ler on public.despesas
  for select using (public.e_admin_do_grupo(group_id));
drop policy if exists lembretes_ler on public.lembretes;
create policy lembretes_ler on public.lembretes
  for select using (public.e_admin_do_grupo(group_id));

-- ── Financeiro: sem plano, só leitura ──
-- Nas tabelas, e não em cada função: pega pagamento, despesa, estorno,
-- avulsa e diária pelo mesmo lugar.
create or replace function public.financeiro_do_plano()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.grupo_premium(new.group_id) then
    return new;
  end if;
  -- O que o SISTEMA lança sozinho não nasce, em silêncio: a mensalidade do
  -- mês e a diária antecipada. Levantar erro ali quebraria a confirmação do
  -- convidado no link e a sincronização do administrador
  -- (ifs aninhados: o gatilho serve a quatro tabelas, e só cobrancas tem tipo)
  if tg_table_name = 'cobrancas' then
    if new.tipo = 'mensalidade' or (new.tipo = 'diaria' and new.criada_por is null) then
      return null;
    end if;
  end if;
  raise exception 'O Financeiro é do plano pago. Sem ele, dá para consultar, mas não lançar.';
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['cobrancas', 'pagamentos', 'despesas', 'lembretes'] loop
    execute format('drop trigger if exists %I_do_plano on public.%I', t, t);
    execute format(
      'create trigger %I_do_plano before insert on public.%I for each row execute function public.financeiro_do_plano()',
      t, t);
  end loop;
end $$;

-- Cancelar à mão também é lançar. O sistema (cancelada_por nulo) continua
-- cancelando a diária de quem perdeu a vaga, e reativando a de quem voltou
create or replace function public.cancelar_do_plano()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.cancelada_em is not null and old.cancelada_em is null and new.cancelada_por is not null
     and not public.grupo_premium(new.group_id) then
    raise exception 'O Financeiro é do plano pago. Sem ele, dá para consultar, mas não lançar.';
  end if;
  return new;
end;
$$;
drop trigger if exists cobrancas_cancelar_do_plano on public.cobrancas;
create trigger cobrancas_cancelar_do_plano
  before update on public.cobrancas
  for each row execute function public.cancelar_do_plano();

-- ── Mais de um administrador ──
create or replace function public.admin_do_plano()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- (ifs aninhados: só group_members tem role)
  if tg_table_name = 'group_members' then
    if new.role is distinct from 'organizador' then
      return new;
    end if;
  end if;
  if not public.grupo_premium(new.group_id) then
    raise exception 'Mais de um administrador é do plano pago.';
  end if;
  return new;
end;
$$;
drop trigger if exists admin_invites_do_plano on public.admin_invites;
create trigger admin_invites_do_plano
  before insert on public.admin_invites
  for each row execute function public.admin_do_plano();
drop trigger if exists group_members_do_plano on public.group_members;
create trigger group_members_do_plano
  before insert on public.group_members
  for each row execute function public.admin_do_plano();

-- ── Até 20 mensalistas no grátis ──
-- Conta o mensalista ativo, aprovado e não excluído. Convidado não conta. Só
-- trava quem ENTRA na conta — cadastro novo, aprovação, reativação, virar
-- mensalista —: quem já contava continua sendo editado e sincronizado, então
-- um grupo com 25 que perde o plano não perde ninguém.
create or replace function public.limite_de_mensalistas()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  conta boolean := coalesce(new.kind, 'mensalista') = 'mensalista'
                   and new.active and not new.pending and new.deleted_at is null;
  ja_contava boolean;
begin
  if not conta then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    ja_contava := coalesce(old.kind, 'mensalista') = 'mensalista'
                  and old.active and not old.pending and old.deleted_at is null;
  else
    -- salvar_jogadores faz insert ... on conflict: o insert de quem já existe
    -- passa por aqui antes de virar update
    select coalesce(p.kind, 'mensalista') = 'mensalista' and p.active and not p.pending and p.deleted_at is null
      into ja_contava from public.players p where p.id = new.id;
  end if;
  if coalesce(ja_contava, false) or public.grupo_premium(new.group_id) then
    return new;
  end if;
  if (select count(*) from public.players p
       where p.group_id = new.group_id and p.id <> new.id
         and coalesce(p.kind, 'mensalista') = 'mensalista'
         and p.active and not p.pending and p.deleted_at is null) >= 20 then
    raise exception 'O plano grátis vai até 20 mensalistas. Para ter mais, assine o plano do grupo.';
  end if;
  return new;
end;
$$;
drop trigger if exists players_limite_de_mensalistas on public.players;
create trigger players_limite_de_mensalistas
  before insert or update on public.players
  for each row execute function public.limite_de_mensalistas();

-- ─────────────────────────────────────────────────────────────
-- Incorporado da migração 022 — o profissional entra no plano.
-- ─────────────────────────────────────────────────────────────

-- 022 · O profissional entra no plano
--
-- Decidido pelo Guilherme em 30/09/2026, junto com as mesmas abas no
-- profissional (Jogo, Atletas, Financeiro, Ajustes): o time tem Financeiro,
-- e o Financeiro é do plano — então o time passa a ter plano como a pelada.
-- Na 021 o profissional tinha ficado de fora (grupo_premium dizia sim).
--
-- Os times que já existem ganham 30 dias de teste a partir de agora; os que
-- têm cortesia ou assinatura continuam como estão. O limite do grátis vale
-- igual: o elenco do time conta como mensalista (é assim que ele sobe para
-- players, kind padrão).

create or replace function public.grupo_premium(gid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((
    select g.cortesia
        or coalesce(g.pago_ate > now(), false)
        or coalesce(g.teste_ate > now(), false)
      from public.groups g where g.id = gid), false);
$$;

update public.groups
   set teste_ate = now() + interval '30 days'
 where mode = 'profissional'
   and not cortesia
   and pago_ate is null;

-- ─────────────────────────────────────────────────────────────
-- Incorporado da migração 023 — um cadastro só de atleta.
-- ─────────────────────────────────────────────────────────────

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

-- ─────────────────────────────────────────────────────────────
-- Incorporado da migração 024 — categoria e naipe do time.
-- ─────────────────────────────────────────────────────────────

-- 024 · Categoria e naipe do time
--
-- Pedido do Guilherme em 30/09/2026: ao criar um grupo profissional, já
-- definir a categoria e o naipe do time. Todo atleta novo nasce com eles,
-- e o técnico não repete a informação a cada cadastro — continua podendo
-- trocar na ficha (a atleta sub-15 que joga no sub-17).
--
-- É do GRUPO, e não do aparelho: todos os administradores veem o mesmo. Na
-- pelada fica nulo. Quem edita é quem já edita o grupo (groups_manage).

alter table public.groups
  add column if not exists age_group text
    check (age_group in ('sub13', 'sub15', 'sub17', 'sub19', 'sub21', 'adulto', 'master')),
  add column if not exists naipe text
    check (naipe in ('masculino', 'feminino', 'misto'));

-- ─────────────────────────────────────────────────────────────
-- Incorporado da migração 025 — excluir um grupo.
-- ─────────────────────────────────────────────────────────────

-- 025 · Excluir um grupo
--
-- Pedido do Guilherme em 30/09/2026: não havia como excluir um grupo pelo
-- app. A política groups_owner_delete deixava o dono apagar a linha, mas um
-- delete direto podia falhar no meio: o estorno aponta para o pagamento (e a
-- despesa) original com ON DELETE RESTRICT, e a cascata a partir do grupo
-- não tem ordem garantida.
--
-- Esta função faz a exclusão inteira, numa transação só:
--   - só o DONO;
--   - só com o nome do grupo digitado (a segunda trava, além da tela);
--   - estornos primeiro, depois o grupo — o resto vai em cascata (atletas,
--     jogos, respostas, partidas, cobranças, pagamentos, despesas, avisos,
--     administradores, convites).
--
-- Não tem volta: nada disso vai para lixeira.

create or replace function public.excluir_grupo(p_group uuid, p_confirmacao text)
returns void language plpgsql security definer set search_path = public as $$
declare g public.groups;
begin
  select * into g from public.groups where id = p_group;
  if g.id is null then
    raise exception 'Grupo não encontrado';
  end if;
  if g.owner_id is distinct from auth.uid() then
    raise exception 'Só o dono pode excluir o grupo.';
  end if;
  if lower(btrim(coalesce(p_confirmacao, ''))) <> lower(btrim(g.name)) then
    raise exception 'O nome digitado não confere com o do grupo.';
  end if;

  -- Os estornos travariam a cascata (ON DELETE RESTRICT no original)
  delete from public.pagamentos where group_id = p_group and estorno_de is not null;
  delete from public.despesas   where group_id = p_group and estorno_de is not null;

  delete from public.groups where id = p_group;
end;
$$;
revoke execute on function public.excluir_grupo(uuid, text) from public, anon;
grant  execute on function public.excluir_grupo(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Incorporado da migração 026 — mais de uma posição por atleta.
-- ─────────────────────────────────────────────────────────────

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

-- ─────────────────────────────────────────────────────────────
-- Incorporado da migração 027 — link de cadastro de atleta.
-- ─────────────────────────────────────────────────────────────

-- 027 · Link de cadastro de atleta, para o time
--
-- Pedido do Guilherme em 30/09/2026: o mesmo link de cadastro da pelada,
-- agora no profissional. O administrador entra no time, vai em Atletas, e
-- cadastra à mão ou manda o link; quem preenche fica aguardando aprovação.
--
-- Todo grupo já tem register_code (a coluna nasceu com padrão). O que muda:
--   - guest_register_info passa a responder para o time, dizendo o tipo, a
--     categoria e o naipe dele (a página mostra o formulário certo);
--   - guest_register_atleta: o pedido do atleta. Categoria e naipe vêm do
--     TIME (migração 024), e não do formulário; posições em ordem, a primeira
--     é a principal (migração 026). O guest_register da pelada não muda.

create or replace function public.guest_register_info(code text)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare g public.groups;
begin
  select * into g from public.groups where register_code = upper(code);
  if g.id is null then
    raise exception 'Link de cadastro inválido';
  end if;
  return jsonb_build_object(
    'name', g.name, 'sport', g.sport, 'mode', g.mode,
    'ageGroup', g.age_group, 'naipe', g.naipe);
end;
$$;
revoke execute on function public.guest_register_info(text) from public;
grant  execute on function public.guest_register_info(text) to anon, authenticated;

create or replace function public.guest_register_atleta(
  code text, p_name text, p_birth date, p_phone text,
  p_posicoes text[], p_height int, p_weight numeric)
returns void language plpgsql security definer set search_path = public as $$
declare g public.groups; nome text; fone text; pendentes int; posicoes text[];
begin
  select * into g from public.groups where register_code = upper(code) and mode = 'profissional';
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
  if p_height is not null and p_height not between 80 and 250 then
    raise exception 'Altura inválida';
  end if;
  if p_weight is not null and p_weight not between 20 and 250 then
    raise exception 'Peso inválido';
  end if;
  -- Só posições do vôlei, sem repetir, na ordem em que vieram
  select coalesce(array_agg(p order by i), '{}') into posicoes
    from (select distinct on (p) p, i
            from unnest(coalesce(p_posicoes, '{}')) with ordinality as t(p, i)
           where p in ('levantador', 'oposto', 'ponteiro', 'central', 'libero')
           order by p, i) x;

  if exists (select 1 from public.players
              where group_id = g.id and active and pending and lower(name) = lower(nome)) then
    raise exception 'Seu cadastro já foi enviado e está aguardando a aprovação do técnico.';
  end if;
  select count(*) into pendentes from public.players
   where group_id = g.id and active and pending;
  if pendentes >= 50 then
    raise exception 'Muitos cadastros aguardando aprovação. Fale com o técnico.';
  end if;

  insert into public.players
    (group_id, name, positions, outras_posicoes, birth_date, phone, height_cm, weight_kg,
     age_group, naipe, kind, pending, added_via_link)
  values (
    g.id, nome,
    case when cardinality(posicoes) = 0 then '{}'::jsonb else jsonb_build_object('volei', posicoes[1]) end,
    coalesce(posicoes[2:], '{}'),
    p_birth, fone, p_height, p_weight,
    g.age_group, g.naipe, 'mensalista', true, true);
end;
$$;
revoke execute on function public.guest_register_atleta(text, text, date, text, text[], int, numeric) from public;
grant  execute on function public.guest_register_atleta(text, text, date, text, text[], int, numeric) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- Incorporado da migração 028 — inscrição em duas fases.
-- ─────────────────────────────────────────────────────────────

-- 028 · Inscrição em duas fases (docs/telas-amador.md, "Inscrição em duas
-- fases" e "As regras da promoção", decidido pelo Guilherme em 01/10/2026)
--
-- Um link só, um grupo de WhatsApp só. Até a promoção, mensalista que
-- confirma tem vaga e convidado espera; na promoção, os convidados sobem por
-- ordem de inscrição; depois, ordem de chegada para todos (ou, com a
-- preferência permanente, o mensalista segue na frente).
--
-- NADA MUDA para quem não configurar. Grupo sem promocao_dias e jogo sem
-- promover_em rodam exatamente o caminho de antes — convidados_com_vaga não
-- é reescrita, ganha um ramo. O app faz a mesma conta (lib/vagas.ts).

-- ── O padrão do grupo (Ajustes) ──
alter table public.groups
  add column if not exists promocao_dias int check (promocao_dias between 0 and 14),
  add column if not exists promocao_hora time,
  add column if not exists preferencia_permanente boolean not null default false;

-- ── O jogo nasce com o padrão e pode ajustar ──
alter table public.events
  add column if not exists promover_em timestamptz,
  -- Quando aconteceu de fato: o agendador, a abertura do link, ou "promover agora"
  add column if not exists promovido_em timestamptz,
  add column if not exists preferencia_permanente boolean not null default false,
  -- Etapa B: o lembrete da véspera já foi enfileirado
  add column if not exists lembrete_promocao_em timestamptz;

-- ── Sincronização dos jogos: os campos da promoção ──
-- promovido_em, uma vez marcado, não volta: a promoção não se desfaz
create or replace function public.salvar_jogos(p_group uuid, p_rows jsonb)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not public.can_manage_group(p_group) then
    raise exception 'Sem permissão neste grupo';
  end if;
  insert into public.events as e
    (id, group_id, title, starts_at, location, slots, sport, status, closed, sorteio, cobra_diaria,
     competicao, promover_em, promovido_em, preferencia_permanente, updated_at)
  select r.id, p_group, r.title, r.starts_at, r.location, r.slots,
         coalesce(r.sport, (select g.sport from public.groups g where g.id = p_group)),
         coalesce(r.status, 'programado'), coalesce(r.status, 'programado') <> 'programado',
         r.sorteio, coalesce(r.cobra_diaria, true), r.competicao,
         r.promover_em, r.promovido_em, coalesce(r.preferencia_permanente, false), r.updated_at
    from jsonb_to_recordset(p_rows) as r(
           id uuid, title text, starts_at timestamptz, location text, slots int,
           sport text, status text, sorteio jsonb, cobra_diaria boolean, competicao text,
           promover_em timestamptz, promovido_em timestamptz, preferencia_permanente boolean,
           updated_at timestamptz)
  on conflict (id) do update set
    title                  = excluded.title,
    starts_at              = excluded.starts_at,
    location               = excluded.location,
    slots                  = excluded.slots,
    sport                  = coalesce(excluded.sport, e.sport),
    status                 = excluded.status,
    closed                 = excluded.closed,
    sorteio                = excluded.sorteio,
    cobra_diaria           = excluded.cobra_diaria,
    competicao             = excluded.competicao,
    promover_em            = excluded.promover_em,
    promovido_em           = coalesce(e.promovido_em, excluded.promovido_em),
    preferencia_permanente = excluded.preferencia_permanente,
    updated_at             = excluded.updated_at
  where e.group_id = p_group
    and e.updated_at < excluded.updated_at;
end;
$$;
revoke execute on function public.salvar_jogos(uuid, jsonb) from public, anon;
grant  execute on function public.salvar_jogos(uuid, jsonb) to authenticated;

-- ── Quem tem vaga: o caminho de sempre, mais o ramo da promoção ──
create or replace function public.convidados_com_vaga(p_event uuid)
returns setof uuid language plpgsql stable security definer set search_path = public as $$
declare ev public.events; momento timestamptz;
begin
  select * into ev from public.events where id = p_event;
  if ev.id is null then
    return;
  end if;
  momento := coalesce(ev.promovido_em, case when now() >= ev.promover_em then ev.promover_em end);

  -- Sem promoção (ou promovido com a preferência permanente): o caminho de
  -- sempre, igual ao da 019
  if ev.promover_em is null or (momento is not null and ev.preferencia_permanente) then
    return query
      with ativos as (
        select a.player_id, a.status, a.answered_at, p.kind
          from public.attendance a join public.players p on p.id = a.player_id
         where a.event_id = p_event and p.active and not p.pending
      ),
      reservadas as (
        select count(*) filter (where status = 'vou' and kind = 'mensalista')
             + count(*) filter (where status = 'chamado') as n
          from ativos
      ),
      convidados as (
        select player_id, row_number() over (order by answered_at, player_id) as ordem
          from ativos where status = 'vou' and kind = 'convidado'
      )
      select c.player_id
        from convidados c, reservadas r
       where ev.slots is null or c.ordem <= greatest(0, ev.slots - r.n);
    return;
  end if;

  -- Antes da promoção: convidado nenhum tem vaga
  if momento is null then
    return;
  end if;

  -- Depois, com a preferência acabando: quem confirmou antes da promoção
  -- segue na frente (os mensalistas); o resto é uma fila só, por chegada
  return query
    with ativos as (
      select a.player_id, a.status, a.answered_at, p.kind
        from public.attendance a join public.players p on p.id = a.player_id
       where a.event_id = p_event and p.active and not p.pending
    ),
    fixos as (
      select count(*) filter (where status = 'vou' and kind = 'mensalista' and answered_at <= momento)
           + count(*) filter (where status = 'chamado') as n
        from ativos
    ),
    fila as (
      select player_id, kind, row_number() over (order by answered_at, player_id) as ordem
        from ativos
       where status = 'vou' and not (kind = 'mensalista' and answered_at <= momento)
    )
    select f.player_id
      from fila f, fixos x
     where f.kind = 'convidado'
       and (ev.slots is null or f.ordem <= greatest(0, ev.slots - x.n));
end;
$$;
revoke execute on function public.convidados_com_vaga(uuid) from public, anon, authenticated;

-- A diária antecipada acompanha a vaga: a promoção (e a mudança dela) também
-- mexe em quem tem vaga
drop trigger if exists events_zz_diarias on public.events;
create trigger events_zz_diarias
  after update of slots, list_closed, cobra_diaria, status, promover_em, promovido_em, preferencia_permanente
  on public.events
  for each row execute function public.diarias_ao_mudar_jogo();

-- ── A promoção preguiçosa ──
-- Marca a promoção dos jogos do grupo que já passaram da hora. A regra de
-- vaga não depende da marca (a hora basta); a marca é o que dispara a
-- diária antecipada e, na etapa B, os avisos.
create or replace function public.promover_vencidos_do_grupo(gid uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.events
     set promovido_em = promover_em
   where group_id = gid
     and promover_em is not null and promovido_em is null
     and promover_em <= now()
     and status = 'programado' and not closed;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.promover_vencidos_do_grupo(uuid) from public, anon, authenticated;

-- Pelo administrador (a rodada de sincronização)
create or replace function public.promover_vencidos(p_group uuid)
returns int language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_group(p_group) then
    raise exception 'Sem permissão neste grupo';
  end if;
  return public.promover_vencidos_do_grupo(p_group);
end;
$$;
revoke execute on function public.promover_vencidos(uuid) from public, anon;
grant  execute on function public.promover_vencidos(uuid) to authenticated;

-- Por quem abre o link (sem conta)
create or replace function public.guest_promover(code text)
returns int language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from public.guest_resolve(code);
  return public.promover_vencidos_do_grupo(r.gid);
end;
$$;
revoke execute on function public.guest_promover(text) from public;
grant  execute on function public.guest_promover(text) to anon, authenticated;

-- ── O link recebe a promoção do jogo, para fazer a mesma conta ──
create or replace function public.guest_group(code text)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare r record; g public.groups; ev public.events; v_sport text; antecipada boolean;
begin
  select * into r from public.guest_resolve(code);
  select * into g from public.groups where id = r.gid;

  select * into ev from public.events
   where group_id = g.id and not closed
     and starts_at >= now() - interval '12 hours'
   order by starts_at asc limit 1;

  v_sport := coalesce(ev.sport, g.sport);
  antecipada := ev.id is not null and ev.cobra_diaria and g.diaria_antecipada and g.diaria_cents is not null;

  return jsonb_build_object(
    'via', r.via,
    'group', jsonb_build_object('name', g.name, 'sport', v_sport, 'mode', g.mode),
    'event', case when ev.id is null then null else jsonb_build_object(
      'id', ev.id, 'title', ev.title, 'startsAt', ev.starts_at,
      'slots', ev.slots, 'location', ev.location,
      'listClosed', ev.list_closed, 'teams', ev.teams,
      'promoverEm', ev.promover_em, 'promovidoEm', ev.promovido_em,
      'preferenciaPermanente', ev.preferencia_permanente,
      'cobrancaAntecipada', case when antecipada then jsonb_build_object(
        'diariaCents', g.diaria_cents,
        'pixChave', g.pix_chave, 'pixNome', g.pix_nome, 'pixCidade', g.pix_cidade) end) end,
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id,
               'name', coalesce(nullif(p.nickname, ''), p.name),
               'kind', p.kind,
               'position', p.positions ->> v_sport,
               'status', case when a.status = 'sem_resposta' then null else a.status end,
               'answeredAt', a.answered_at,
               'esperaDesde', a.espera_desde,
               'chamadoEm', a.chamado_em,
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
-- Incorporado da migração 029 — avisos e agendador da promoção.
-- ─────────────────────────────────────────────────────────────

-- 029 · Inscrição em duas fases, etapa B: os avisos e o agendador
--
-- docs/telas-amador.md, "As regras da promoção". A promoção vira um evento com
-- hora marcada — e por isso avisa sozinha. Os avisos entram pela caixa de
-- saída de sempre (avisos → Database Webhook → enviar-aviso, migração 016), e
-- só para quem ativou "Me avise pelo celular" (avisar_jogador já filtra).
--
--   - na promoção: o convidado que subiu ("você tem vaga"), quem ficou na
--     espera (com a posição), os convidados que ainda não se inscreveram
--     ("abriu para convidados, N vagas") e os administradores (o resumo);
--   - com a preferência permanente, o convidado que um mensalista atrasado
--     derrubou ("você voltou para a espera");
--   - na véspera: o mensalista que não respondeu ("falta você confirmar").
--
-- A promoção pode vir do agendador (abaixo), da abertura do link, da rodada
-- do administrador ou do "Promover agora": os avisos saem de um gatilho em
-- promovido_em, então saem uma vez só, venha de onde vier.

-- ── A fila de espera da promoção, com a posição (a mesma conta de vagas) ──
create or replace function public.fila_da_promocao(p_event uuid)
returns table (player_id uuid, posicao int)
language plpgsql stable security definer set search_path = public as $$
declare ev public.events; momento timestamptz; fixos int;
begin
  select * into ev from public.events where id = p_event;
  if ev.id is null or ev.promover_em is null then
    return;
  end if;
  momento := coalesce(ev.promovido_em, case when now() >= ev.promover_em then ev.promover_em end);
  if momento is null then
    return;
  end if;

  if ev.preferencia_permanente then
    -- A regra de sempre: convidados sem vaga, na ordem de inscrição
    return query
      select x.player_id, (row_number() over (order by x.answered_at, x.player_id))::int
        from (select a.player_id, a.answered_at
                from public.attendance a join public.players p on p.id = a.player_id
               where a.event_id = p_event and a.status = 'vou' and p.kind = 'convidado'
                 and p.active and not p.pending
                 and a.player_id not in (select public.convidados_com_vaga(p_event))) x;
    return;
  end if;

  -- Ordem de chegada: quem passou do número de vagas, na ordem da fila
  select count(*) filter (where a.status = 'vou' and p.kind = 'mensalista' and a.answered_at <= momento)
       + count(*) filter (where a.status = 'chamado')
    into fixos
    from public.attendance a join public.players p on p.id = a.player_id
   where a.event_id = p_event and p.active and not p.pending;
  return query
    select f.player_id, (f.ordem - greatest(0, coalesce(ev.slots, 0) - fixos))::int
      from (select a.player_id, row_number() over (order by a.answered_at, a.player_id) as ordem
              from public.attendance a join public.players p on p.id = a.player_id
             where a.event_id = p_event and a.status = 'vou' and p.active and not p.pending
               and not (p.kind = 'mensalista' and a.answered_at <= momento)) f
     where ev.slots is not null and f.ordem > greatest(0, ev.slots - fixos);
end;
$$;
revoke execute on function public.fila_da_promocao(uuid) from public, anon, authenticated;

-- ── Os avisos da promoção ──
create or replace function public.avisar_promocao(p_event uuid)
returns void language plpgsql security definer set search_path = public as $$
declare ev public.events; g public.groups; quando text; subiram int; esperando int; livres int; r record;
begin
  select * into ev from public.events where id = p_event;
  if ev.id is null then
    return;
  end if;
  select * into g from public.groups where id = ev.group_id;
  quando := public.quando_do_jogo(ev.starts_at);

  -- Quem subiu
  subiram := 0;
  for r in select id from public.convidados_com_vaga(p_event) as id loop
    perform public.avisar_jogador(r.id, p_event, 'promocao_vaga', 'Você tem vaga! ✅',
      g.name || ': abriu para convidados e você entrou no jogo de ' || quando || '.');
    subiram := subiram + 1;
  end loop;

  -- Quem ficou na espera, com a posição
  esperando := 0;
  for r in select * from public.fila_da_promocao(p_event) loop
    perform public.avisar_jogador(r.player_id, p_event, 'promocao_espera', 'Você está na espera',
      g.name || ': abriu para convidados. Você é o ' || r.posicao || 'º da espera para ' || quando
        || ' — se abrir vaga, você entra sozinho.');
    esperando := esperando + 1;
  end loop;

  -- Vagas que sobraram: os convidados do grupo que ainda não se inscreveram
  select greatest(0, ev.slots
           - (select count(*) from public.attendance a join public.players p on p.id = a.player_id
               where a.event_id = p_event and a.status in ('vou', 'chamado') and p.active and not p.pending)
           + esperando)
    into livres;
  if ev.slots is not null and livres > 0 then
    for r in select p.id from public.players p
              where p.group_id = ev.group_id and p.kind = 'convidado' and p.active and not p.pending
                and not exists (select 1 from public.attendance a
                                 where a.event_id = p_event and a.player_id = p.id
                                   and a.status in ('vou', 'nao_vou', 'espera', 'chamado')) loop
      perform public.avisar_jogador(r.id, p_event, 'promocao_aberta', 'Abriu para convidados',
        g.name || ': ' || livres || case when livres = 1 then ' vaga' else ' vagas' end
          || ' para ' || quando || '. Coloque seu nome no link.');
    end loop;
  end if;

  perform public.avisar_admins(ev.group_id, p_event, 'promocao_admin', 'Abriu para convidados',
    g.name || ': ' || subiram || case when subiram = 1 then ' convidado subiu' else ' convidados subiram' end
      || case when esperando > 0 then ', ' || esperando || ' na espera' else '' end || '.');
end;
$$;
revoke execute on function public.avisar_promocao(uuid) from public, anon, authenticated;

-- A promoção acabou de acontecer — venha de onde vier
create or replace function public.promocao_ao_promover()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.promovido_em is null and new.promovido_em is not null and new.status = 'programado' then
    perform public.avisar_promocao(new.id);
  end if;
  return null;
end;
$$;
drop trigger if exists events_zz_promocao on public.events;
create trigger events_zz_promocao
  after update of promovido_em on public.events
  for each row execute function public.promocao_ao_promover();

-- ── Preferência permanente: o convidado derrubado é avisado ──
-- Um mensalista confirmou depois da promoção e ficou com a última vaga: o
-- convidado que estava nela volta para o topo da espera, e precisa saber.
create or replace function public.promocao_ao_responder()
returns trigger language plpgsql security definer set search_path = public as $$
declare ev public.events; vez text; derrubado uuid; cabem int; quando text; gnome text;
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  if new.status <> 'vou' or (tg_op = 'UPDATE' and old.status = 'vou') then
    return null;
  end if;
  select kind into vez from public.players where id = new.player_id;
  if vez is distinct from 'mensalista' then
    return null;
  end if;
  select * into ev from public.events where id = new.event_id;
  if ev.promover_em is null or not ev.preferencia_permanente or ev.slots is null
     or coalesce(ev.promovido_em, case when now() >= ev.promover_em then ev.promover_em end) is null then
    return null;
  end if;

  -- Quantas vagas sobram agora para convidado; quem estava logo depois disso
  -- (pela ordem de inscrição) é o que acabou de perder a vaga
  select greatest(0, ev.slots
           - count(*) filter (where a.status = 'vou' and p.kind = 'mensalista')
           - count(*) filter (where a.status = 'chamado'))
    into cabem
    from public.attendance a join public.players p on p.id = a.player_id
   where a.event_id = ev.id and p.active and not p.pending;
  select x.player_id into derrubado
    from (select a.player_id, row_number() over (order by a.answered_at, a.player_id) as ordem
            from public.attendance a join public.players p on p.id = a.player_id
           where a.event_id = ev.id and a.status = 'vou' and p.kind = 'convidado'
             and p.active and not p.pending) x
   where x.ordem = cabem + 1;
  if derrubado is not null then
    select name into gnome from public.groups where id = ev.group_id;
    quando := public.quando_do_jogo(ev.starts_at);
    perform public.avisar_jogador(derrubado, ev.id, 'promocao_derrubado', 'Você voltou para a espera',
      gnome || ': um mensalista confirmou e ficou com a última vaga de ' || quando
        || '. Você é o 1º da espera — se abrir vaga, você entra sozinho.');
  end if;
  return null;
end;
$$;
drop trigger if exists attendance_zz_promocao on public.attendance;
create trigger attendance_zz_promocao
  after insert or update on public.attendance
  for each row execute function public.promocao_ao_responder();

-- ── O agendador: promove na hora marcada e lembra na véspera ──
create or replace function public.promover_e_lembrar()
returns void language plpgsql security definer set search_path = public as $$
declare ev public.events; gnome text; quando text; r record;
begin
  -- Promoção na hora marcada (o gatilho acima avisa)
  update public.events
     set promovido_em = promover_em
   where promover_em is not null and promovido_em is null
     and promover_em <= now()
     and status = 'programado' and not closed;

  -- Lembrete da véspera: a promoção é nas próximas 24 h, e ainda não lembrou
  for ev in select * from public.events
             where promover_em is not null and promovido_em is null
               and lembrete_promocao_em is null
               and promover_em > now() and promover_em <= now() + interval '24 hours'
               and status = 'programado' and not closed loop
    update public.events set lembrete_promocao_em = now() where id = ev.id;
    select name into gnome from public.groups where id = ev.group_id;
    quando := public.quando_do_jogo(ev.promover_em);
    for r in select p.id from public.players p
              where p.group_id = ev.group_id and p.kind = 'mensalista' and p.active and not p.pending
                and not exists (select 1 from public.attendance a
                                 where a.event_id = ev.id and a.player_id = p.id
                                   and a.status in ('vou', 'nao_vou', 'espera', 'chamado')) loop
      perform public.avisar_jogador(r.id, ev.id, 'promocao_vespera', 'Falta você confirmar',
        gnome || ': ' || quando || ' sua vaga abre para convidados. Confirme no link.');
    end loop;
  end loop;
end;
$$;
revoke execute on function public.promover_e_lembrar() from public, anon, authenticated;
