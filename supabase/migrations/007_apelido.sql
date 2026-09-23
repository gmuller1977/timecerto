-- ─────────────────────────────────────────────────────────────
-- 007 — Apelido
--
-- Na pelada, o apelido é o nome pelo qual todo mundo se conhece. Onde houver
-- apelido, ele aparece no lugar do nome — nos links, nos times, no placar.
-- O nome completo continua guardado e aparece na ficha do administrador.
--
-- Rodar uma vez no SQL Editor, DEPOIS da 006. Não apaga dados; troca a
-- função de cadastro por uma versão com apelido (a antiga é removida para
-- não ficarem duas com o mesmo nome).
-- ─────────────────────────────────────────────────────────────

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
