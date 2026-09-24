-- ─────────────────────────────────────────────────────────────
-- 008 — Lista fechada e times no link
--
-- Fechar a lista é diferente de encerrar o jogo. `closed` tira o jogo do
-- link (é o que "Abrir outro jogo" faz com o anterior); `list_closed` só para
-- de aceitar resposta — o jogo continua no link, com quem confirmou e, depois
-- do sorteio, com os times.
--
-- `teams` é o sorteio publicado pelo organizador. Guarda só ids da nuvem:
-- o nome sai da mesma lista que o link já recebe, então o apelido vale e o
-- nível do jogador nunca sai do aparelho do organizador.
--   { "drawnAt": iso, "teams": [{ "name", "color", "players": [id] }], "bench": [id] }
--
-- Rodar uma vez no SQL Editor, DEPOIS da 007. Não apaga dados: acrescenta
-- duas colunas e troca três funções por versões que respeitam a lista fechada.
-- ─────────────────────────────────────────────────────────────

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
