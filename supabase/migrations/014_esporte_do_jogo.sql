-- ─────────────────────────────────────────────────────────────
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
