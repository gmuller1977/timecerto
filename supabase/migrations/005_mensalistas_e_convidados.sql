-- ─────────────────────────────────────────────────────────────
-- 005 — Mensalistas e convidados
--
-- Regras decididas pelo Guilherme em 23/09/2026:
--   · o administrador define no cadastro quem é mensalista e quem é convidado;
--   · o jogo tem N vagas; mensalista que confirma sempre joga;
--   · convidado entra numa FILA por ordem de chegada e só ganha vaga se sobrar;
--   · dois links: um para os mensalistas, outro para convidados;
--   · convidado chega pelo organizador, por um mensalista ("levar alguém")
--     ou se inscrevendo sozinho pelo link de convidados.
--
-- A fila NÃO é guardada: sai da ordem de answered_at, calculada no app
-- (lib/vagas.ts). Mensalista desistiu, o primeiro da fila entra sozinho.
--
-- Rodar uma vez no SQL Editor. Não apaga dados.
-- ─────────────────────────────────────────────────────────────

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
