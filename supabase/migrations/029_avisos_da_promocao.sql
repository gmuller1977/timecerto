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
