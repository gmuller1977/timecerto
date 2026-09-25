-- ─────────────────────────────────────────────────────────────
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
