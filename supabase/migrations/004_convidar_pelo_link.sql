-- ─────────────────────────────────────────────────────────────
-- 004 — Incluir quem não está na lista, pelo próprio link do grupo
--
-- Dois casos, uma função:
--   · "não achei meu nome"  → a pessoa se inclui (invited_by nulo)
--   · "vou levar alguém"    → quem já se identificou inclui um convidado
-- Nos dois, a pessoa nova já entra confirmada no jogo aberto.
--
-- Rodar uma vez no SQL Editor. Não apaga dados.
-- ─────────────────────────────────────────────────────────────

alter table public.players
  add column if not exists added_via_link boolean not null default false,
  add column if not exists invited_by uuid references public.players on delete set null;

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

-- A lista do link passa a dizer quem entrou como convidado de quem
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
