-- ─────────────────────────────────────────────────────────────
-- 016 — Avisos no celular (web push)
--
-- Pedido do Guilherme em 25/09/2026, fase 2 da fila de espera. Quem ativa
-- "Me avise pelo celular" no link recebe:
--   - abriu uma vaga para você (chamado da fila de espera);
--   - jogo novo marcado (quando o jogo passa a ser o próximo, nos links);
--   - times sorteados (o seu time, quando ele é publicado ou muda);
--   - aviso manual do administrador.
-- E o administrador que ativar em Ajustes recebe: alguém saiu, aceitou ou
-- recusou a vaga, e vaga aberta sem ninguém na espera.
--
-- Como funciona: todo aviso vira uma linha em `avisos` — a caixa de saída —,
-- gravada pelos gatilhos ou pelo administrador. Um Database Webhook chama a
-- Edge Function `enviar-aviso` a cada linha nova, e ela entrega aos celulares
-- inscritos. Só entra na caixa quem tem para onde entregar.
--
-- Segurança:
--   - `push_inscricoes` e `avisos` não têm política nenhuma: só as funções
--     abaixo mexem nelas. O administrador não lê as chaves dos celulares — só
--     QUAIS atletas têm aviso (`inscritos_com_aviso`);
--   - o endereço de entrega só pode ser dos serviços de push (Google, Apple,
--     Mozilla, Microsoft). Sem isso, alguém cadastraria um endereço qualquer
--     e faria o servidor mandar requisições para ele;
--   - a Edge Function só entrega aviso que está na caixa e ainda não saiu:
--     chamá-la de fora não inventa aviso nenhum.
--
-- Horário dos avisos em America/Sao_Paulo.
--
-- Rodar uma vez no SQL Editor, DEPOIS da 015. Não apaga dados: cria duas
-- tabelas e uma coluna, e troca a função que chama o próximo da espera (ela
-- passa a devolver quem chamou) e o gatilho das respostas.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.push_inscricoes (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups on delete cascade,
  -- Atleta (pelo link) OU administrador (pela conta) — nunca os dois
  player_id  uuid references public.players on delete cascade,
  user_id    uuid references auth.users on delete cascade,
  endpoint   text not null unique
    check (length(endpoint) < 1000 and endpoint ~ ('^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com'
                                                  || '|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/')),
  p256dh     text not null check (length(p256dh) between 20 and 200),
  auth       text not null check (length(auth) between 8 and 100),
  criado_em  timestamptz not null default now(),
  check ((player_id is null) <> (user_id is null))
);
create index if not exists push_inscricoes_grupo_idx on public.push_inscricoes (group_id);
create index if not exists push_inscricoes_jogador_idx on public.push_inscricoes (player_id);
alter table public.push_inscricoes enable row level security;

create table if not exists public.avisos (
  id         bigint generated always as identity primary key,
  group_id   uuid not null references public.groups on delete cascade,
  event_id   uuid references public.events on delete set null,
  destino    text not null check (destino in ('jogador', 'admins')),
  player_id  uuid references public.players on delete cascade,
  tipo       text not null,
  titulo     text not null check (length(titulo) <= 120),
  corpo      text not null check (length(corpo) <= 400),
  -- Caminho dentro do app; o celular completa com o endereço do próprio app
  url        text not null default '/',
  criado_em  timestamptz not null default now(),
  enviado_em timestamptz,
  resultado  jsonb,
  check ((destino = 'jogador') = (player_id is not null))
);
create index if not exists avisos_pendentes_idx on public.avisos (id) where enviado_em is null;
alter table public.avisos enable row level security;

-- Jogo já anunciado aos inscritos. Os jogos que já existem contam como
-- anunciados: rodar a migração não pode disparar aviso para ninguém.
alter table public.events add column if not exists anunciado_em timestamptz;
update public.events set anunciado_em = now() where anunciado_em is null;

-- ── Textos ──

-- "sábado, 26/09 às 20:00"
create or replace function public.quando_do_jogo(p_inicio timestamptz)
returns text language sql immutable set search_path = public as $$
  select (array['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'])
           [extract(dow from p_inicio at time zone 'America/Sao_Paulo')::int + 1]
         || ', ' || to_char(p_inicio at time zone 'America/Sao_Paulo', 'DD/MM')
         || ' às ' || to_char(p_inicio at time zone 'America/Sao_Paulo', 'HH24:MI');
$$;

-- O link da pessoa, já aberto como ela (`?eu=`): mensalista pelo link dos
-- mensalistas, convidado pelo de convidados
create or replace function public.link_do_jogador(p_player uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when p.kind = 'convidado' and g.guest_code is not null
              then '/#/v/' || g.guest_code else '/#/c/' || g.invite_code end
         || '?eu=' || p.id
    from public.players p join public.groups g on g.id = p.group_id
   where p.id = p_player;
$$;
revoke execute on function public.link_do_jogador(uuid) from public, anon, authenticated;

-- Nome como o grupo conhece
create or replace function public.nome_do_jogador(p_player uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(nickname, ''), name) from public.players where id = p_player;
$$;
revoke execute on function public.nome_do_jogador(uuid) from public, anon, authenticated;

-- ── Pôr na caixa de saída — só quem tem para onde entregar ──

create or replace function public.avisar_jogador(
  p_player uuid, p_event uuid, p_tipo text, p_titulo text, p_corpo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.avisos (group_id, event_id, destino, player_id, tipo, titulo, corpo, url)
  select p.group_id, p_event, 'jogador', p.id, p_tipo, left(p_titulo, 120), left(p_corpo, 400),
         public.link_do_jogador(p.id)
    from public.players p
   where p.id = p_player and p.active and not p.pending
     and exists (select 1 from public.push_inscricoes s where s.player_id = p.id);
end;
$$;
revoke execute on function public.avisar_jogador(uuid, uuid, text, text, text) from public, anon, authenticated;

create or replace function public.avisar_admins(
  p_group uuid, p_event uuid, p_tipo text, p_titulo text, p_corpo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.push_inscricoes s
              where s.group_id = p_group and s.user_id is not null) then
    insert into public.avisos (group_id, event_id, destino, tipo, titulo, corpo, url)
    values (p_group, p_event, 'admins', p_tipo, left(p_titulo, 120), left(p_corpo, 400), '/#/amador');
  end if;
end;
$$;
revoke execute on function public.avisar_admins(uuid, uuid, text, text, text) from public, anon, authenticated;

-- ── Vaga aberta ──
-- A mesma da 015; agora avisa quem foi chamado e devolve o primeiro chamado,
-- para o gatilho contar ao administrador.
drop function if exists public.chamar_proximo(uuid, uuid);
create function public.chamar_proximo(p_event uuid, p_vaga_de uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare ev public.events; ocupadas int; prox uuid; de uuid := p_vaga_de; primeiro uuid; grupo text;
begin
  select * into ev from public.events where id = p_event;
  if ev.id is null or ev.closed or not ev.list_closed or ev.slots is null then
    return null;
  end if;
  select name into grupo from public.groups where id = ev.group_id;
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
    perform public.avisar_jogador(prox, p_event, 'vaga', 'Abriu uma vaga para você!',
      grupo || ' · ' || public.quando_do_jogo(ev.starts_at)
      || '. Você era o próximo da fila de espera. Ainda quer jogar? Toque para responder.');
    primeiro := coalesce(primeiro, prox);
    de := null;
  end loop;
  return primeiro;
end;
$$;
revoke execute on function public.chamar_proximo(uuid, uuid) from public, anon, authenticated;

-- A mesma da 015, e conta ao administrador o que aconteceu com a vaga
create or replace function public.fila_ao_responder()
returns trigger language plpgsql security definer set search_path = public as $$
declare de uuid; chamado uuid; ev public.events; nome text; depois text;
begin
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
  chamado := public.chamar_proximo(new.event_id, de);

  if tg_op = 'UPDATE' then
    select * into ev from public.events where id = new.event_id;
    if ev.list_closed and not ev.closed then
      nome := public.nome_do_jogador(new.player_id);
      depois := case when chamado is not null
                     then public.nome_do_jogador(chamado) || ' foi chamado da fila de espera.'
                     else 'Ninguém na fila de espera: a vaga está aberta.' end;
      if old.status = 'vou' and new.status <> 'vou' then
        perform public.avisar_admins(ev.group_id, ev.id, 'saiu', nome || ' saiu do jogo', depois);
      elsif old.status = 'chamado' and new.status = 'vou' then
        perform public.avisar_admins(ev.group_id, ev.id, 'aceitou', nome || ' aceitou a vaga',
          'Já está na lista do jogo de ' || public.quando_do_jogo(ev.starts_at) || '.');
      elsif old.status = 'chamado' and new.status = 'nao_vou' then
        perform public.avisar_admins(ev.group_id, ev.id, 'recusou', nome || ' não pode jogar', depois);
      end if;
    end if;
  end if;
  return null;
end;
$$;

-- ── Jogo novo marcado ──
-- O próximo jogo do grupo (a regra do link) é anunciado uma vez só. Roda
-- quando um jogo é criado, muda de data ou de status — e pelo administrador,
-- a cada sincronização, para pegar o jogo que virou o próximo porque o
-- anterior passou da janela de 12 h.
create or replace function public.anunciar_proximo(p_group uuid)
returns void language plpgsql security definer set search_path = public as $$
declare ev public.events; grupo text;
begin
  select * into ev from public.events
   where group_id = p_group and not closed
     and starts_at >= now() - interval '12 hours'
   order by starts_at asc limit 1;
  if ev.id is null or ev.anunciado_em is not null then
    return;
  end if;
  update public.events set anunciado_em = now() where id = ev.id;
  select name into grupo from public.groups where id = p_group;

  insert into public.avisos (group_id, event_id, destino, player_id, tipo, titulo, corpo, url)
  select p_group, ev.id, 'jogador', p.id, 'jogo',
         left('Jogo marcado: ' || public.quando_do_jogo(ev.starts_at), 120),
         left(grupo || coalesce(' · ' || nullif(ev.location, ''), '') || '. Vai? Toque para responder.', 400),
         public.link_do_jogador(p.id)
    from public.players p
   where p.group_id = p_group and p.active and not p.pending
     and exists (select 1 from public.push_inscricoes s where s.player_id = p.id);
end;
$$;
revoke execute on function public.anunciar_proximo(uuid) from public, anon, authenticated;

create or replace function public.anuncio_ao_mudar_jogo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.anunciar_proximo(new.group_id);
  return null;
end;
$$;

drop trigger if exists events_anuncio on public.events;
create trigger events_anuncio
  after insert or update of status, starts_at, closed on public.events
  for each row execute function public.anuncio_ao_mudar_jogo();

-- Chamada pelo app do administrador a cada sincronização
create or replace function public.anunciar_jogo(p_group uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_group(p_group) then
    raise exception 'Sem permissão neste grupo';
  end if;
  perform public.anunciar_proximo(p_group);
end;
$$;
revoke execute on function public.anunciar_jogo(uuid) from public, anon;
grant  execute on function public.anunciar_jogo(uuid) to authenticated;

-- ── Times sorteados ──
-- Só quem mudou de lugar é avisado: republicar depois de encaixar um
-- substituto não pode avisar o time inteiro de novo.
create or replace function public.time_de(p_teams jsonb, p_player text)
returns text language sql immutable set search_path = public as $$
  select coalesce(
    (select t ->> 'name' from jsonb_array_elements(coalesce(p_teams -> 'teams', '[]'::jsonb)) t
      where t -> 'players' ? p_player limit 1),
    case when coalesce(p_teams -> 'bench', '[]'::jsonb) ? p_player then 'reservas' end);
$$;

create or replace function public.avisar_times()
returns trigger language plpgsql security definer set search_path = public as $$
declare pid text; onde text; grupo text; quando text;
begin
  if new.teams is null then
    return null;
  end if;
  select name into grupo from public.groups where id = new.group_id;
  quando := public.quando_do_jogo(new.starts_at);
  for pid in
    select jsonb_array_elements_text(t -> 'players')
      from jsonb_array_elements(coalesce(new.teams -> 'teams', '[]'::jsonb)) t
    union all
    select jsonb_array_elements_text(coalesce(new.teams -> 'bench', '[]'::jsonb))
  loop
    onde := public.time_de(new.teams, pid);
    continue when onde is not distinct from public.time_de(old.teams, pid);
    perform public.avisar_jogador(pid::uuid, new.id, 'times',
      case when onde = 'reservas' then 'Times sorteados: você começa como reserva'
           else 'Times sorteados: você está no ' || onde end,
      grupo || ' · ' || quando || '. Toque para ver os times.');
  end loop;
  return null;
end;
$$;

drop trigger if exists events_times on public.events;
create trigger events_times
  after update of teams on public.events
  for each row execute function public.avisar_times();

-- ── Aviso manual do administrador ──
create or replace function public.avisar_inscritos(p_group uuid, p_texto text)
returns int language plpgsql security definer set search_path = public as $$
declare texto text; grupo text; n int;
begin
  if not public.can_manage_group(p_group) then
    raise exception 'Sem permissão neste grupo';
  end if;
  texto := btrim(coalesce(p_texto, ''));
  if length(texto) < 2 or length(texto) > 300 then
    raise exception 'O aviso precisa ter entre 2 e 300 letras';
  end if;
  select name into grupo from public.groups where id = p_group;
  insert into public.avisos (group_id, destino, player_id, tipo, titulo, corpo, url)
  select p_group, 'jogador', p.id, 'manual', left(grupo, 120), texto, public.link_do_jogador(p.id)
    from public.players p
   where p.group_id = p_group and p.active and not p.pending
     and exists (select 1 from public.push_inscricoes s where s.player_id = p.id);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.avisar_inscritos(uuid, text) from public, anon;
grant  execute on function public.avisar_inscritos(uuid, text) to authenticated;

-- Quais atletas do grupo têm aviso ativado — sem as chaves
create or replace function public.inscritos_com_aviso(p_group uuid)
returns setof uuid language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_manage_group(p_group) then
    raise exception 'Sem permissão neste grupo';
  end if;
  return query select distinct s.player_id from public.push_inscricoes s
                where s.group_id = p_group and s.player_id is not null;
end;
$$;
revoke execute on function public.inscritos_com_aviso(uuid) from public, anon;
grant  execute on function public.inscritos_com_aviso(uuid) to authenticated;

-- ── Inscrever e cancelar ──

-- O atleta, pelo link. Um celular é de uma pessoa por vez: o mesmo endereço
-- passa para quem se inscreveu por último. Até 5 aparelhos por pessoa.
create or replace function public.guest_inscrever_aviso(
  code text, p_player uuid, p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from public.guest_resolve(code);
  if not exists (select 1 from public.players
                  where id = p_player and group_id = r.gid and active and not pending
                    and (r.via = 'mensalistas' or kind = 'convidado')) then
    raise exception 'Jogador não encontrado neste grupo';
  end if;
  insert into public.push_inscricoes (group_id, player_id, endpoint, p256dh, auth)
  values (r.gid, p_player, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set group_id = excluded.group_id, player_id = excluded.player_id, user_id = null,
        p256dh = excluded.p256dh, auth = excluded.auth, criado_em = now();
  delete from public.push_inscricoes
   where id in (select id from public.push_inscricoes where player_id = p_player
                 order by criado_em desc offset 5);
end;
$$;
revoke execute on function public.guest_inscrever_aviso(text, uuid, text, text, text) from public;
grant  execute on function public.guest_inscrever_aviso(text, uuid, text, text, text) to anon, authenticated;

create or replace function public.guest_cancelar_aviso(code text, p_endpoint text)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from public.guest_resolve(code);
  delete from public.push_inscricoes
   where endpoint = p_endpoint and group_id = r.gid and player_id is not null;
end;
$$;
revoke execute on function public.guest_cancelar_aviso(text, text) from public;
grant  execute on function public.guest_cancelar_aviso(text, text) to anon, authenticated;

-- O administrador, pela conta
create or replace function public.inscrever_admin(
  p_group uuid, p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_group(p_group) then
    raise exception 'Sem permissão neste grupo';
  end if;
  insert into public.push_inscricoes (group_id, user_id, endpoint, p256dh, auth)
  values (p_group, auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set group_id = excluded.group_id, user_id = excluded.user_id, player_id = null,
        p256dh = excluded.p256dh, auth = excluded.auth, criado_em = now();
  delete from public.push_inscricoes
   where id in (select id from public.push_inscricoes where user_id = auth.uid()
                 order by criado_em desc offset 5);
end;
$$;
revoke execute on function public.inscrever_admin(uuid, text, text, text) from public, anon;
grant  execute on function public.inscrever_admin(uuid, text, text, text) to authenticated;

create or replace function public.cancelar_aviso_admin(p_endpoint text)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.push_inscricoes where endpoint = p_endpoint and user_id = auth.uid();
end;
$$;
revoke execute on function public.cancelar_aviso_admin(text) from public, anon;
grant  execute on function public.cancelar_aviso_admin(text) to authenticated;
