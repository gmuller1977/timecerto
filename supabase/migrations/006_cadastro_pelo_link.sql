-- ─────────────────────────────────────────────────────────────
-- 006 — Cadastro do mensalista pelo link, local do jogo
--
-- Fluxo decidido pelo Guilherme em 23/09/2026:
--   · o administrador manda o LINK DE CADASTRO aos mensalistas;
--   · cada um preenche nome, nascimento, telefone, posição e nível;
--   · o cadastro fica PENDENTE até o administrador aprovar;
--   · o nível que a pessoa marca é sugestão — o administrador ajusta.
--
-- Telefone e nascimento são dado pessoal: nenhuma função guest_* devolve.
--
-- Rodar uma vez no SQL Editor, DEPOIS da 005. Não apaga dados.
-- ─────────────────────────────────────────────────────────────

alter table public.players
  add column if not exists phone text check (phone ~ '^[0-9]{10,13}$'),
  -- Pedido de cadastro ainda não aprovado: não aparece em link nenhum
  add column if not exists pending boolean not null default false;

-- Link de cadastro, separado do de confirmação: quem tem o de confirmar não
-- deve poder se cadastrar, e vice-versa
alter table public.groups
  add column if not exists register_code text unique
  default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

-- Local do jogo ("Quadra do Clube, Rua X")
alter table public.events
  add column if not exists location text check (length(location) <= 120);

-- Pedido de cadastro. Só grupo amador, só pelo link de cadastro.
create or replace function public.guest_register(
  code text, p_name text, p_birth date, p_phone text, p_position text, p_level int)
returns void language plpgsql security definer set search_path = public as $$
declare g public.groups; nome text; fone text; pendentes int;
begin
  select * into g from public.groups where register_code = upper(code) and mode = 'amador';
  if g.id is null then
    raise exception 'Link de cadastro inválido';
  end if;

  nome := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  if length(nome) < 2 or length(nome) > 40 then
    raise exception 'Nome precisa ter entre 2 e 40 letras';
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

  -- Teto de pedidos em aberto: o link circula no WhatsApp
  select count(*) into pendentes from public.players
   where group_id = g.id and active and pending;
  if pendentes >= 50 then
    raise exception 'Muitos cadastros aguardando aprovação. Fale com o organizador.';
  end if;

  insert into public.players
    (group_id, name, skills, positions, birth_date, phone, kind, pending, added_via_link)
  values (
    g.id, nome,
    jsonb_build_object(g.sport, p_level),
    case when coalesce(p_position, '') = '' then '{}'::jsonb
         else jsonb_build_object(g.sport, p_position) end,
    p_birth, fone, 'mensalista', true, true);
end;
$$;

revoke execute on function public.guest_register(text, text, date, text, text, int) from public;
grant  execute on function public.guest_register(text, text, date, text, text, int) to anon, authenticated;

-- Nome do grupo e esporte, para a tela de cadastro montar as posições
create or replace function public.guest_register_info(code text)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare g public.groups;
begin
  select * into g from public.groups where register_code = upper(code) and mode = 'amador';
  if g.id is null then
    raise exception 'Link de cadastro inválido';
  end if;
  return jsonb_build_object('name', g.name, 'sport', g.sport);
end;
$$;

revoke execute on function public.guest_register_info(text) from public;
grant  execute on function public.guest_register_info(text) to anon, authenticated;

-- A tela dos links: sem pendentes, com o local do jogo. Telefone e
-- nascimento continuam de fora.
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
       where p.group_id = g.id and p.active and not p.pending
    ), '[]'::jsonb)
  );
end;
$$;

-- Pendente também não confirma presença nem leva convidado
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
