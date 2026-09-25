-- ─────────────────────────────────────────────────────────────
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
