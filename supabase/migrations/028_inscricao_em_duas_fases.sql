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
