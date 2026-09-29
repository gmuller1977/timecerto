-- ─────────────────────────────────────────────────────────────
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
