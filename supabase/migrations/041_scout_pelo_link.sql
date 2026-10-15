-- 041 · Scout pelo link: alguém de fora marca a partida, os admins acompanham
--
-- Pedido do Guilherme em 15/10/2026. Dentro da partida, o administrador cria
-- um link e manda para quem vai marcar (não precisa ser admin nem ter conta).
--
-- - O link marca pontos, tipo de ponto e jogador, com o detalhe de scout que
--   o administrador escolheu. Não muda a configuração.
-- - UM aparelho por link: o primeiro que abre fica com ele; os outros veem
--   "link em uso". O administrador pode liberar o link para outro aparelho.
-- - A partida em andamento fica aqui, em `partidas_ao_vivo.estado` (o
--   mesmo formato da partida ao vivo do aparelho, com ids da nuvem). Os
--   administradores leem esta tabela e veem placar e scout em tempo real.
-- - Encerrar grava a partida em `matches.dados`, como a sincronização faz, e
--   ela chega ao histórico de todos os administradores. Depois disso o link
--   mostra "jogo encerrado".
--
-- Ninguém de fora lê nem escreve a tabela: o link passa pelas funções
-- guest_scout_*, que conferem o token e o aparelho.
--
-- Rodar uma vez no SQL Editor, DEPOIS da 040. Não apaga nem altera dados:
-- cria uma tabela e funções.

create table if not exists public.partidas_ao_vivo (
  id           uuid primary key default gen_random_uuid(),
  -- 64 caracteres aleatórios: o link é a única barreira
  token        text not null unique
               default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  group_id     uuid not null references public.groups on delete cascade,
  event_id     uuid references public.events on delete set null,
  sport        text not null default 'volei',
  estado       jsonb not null check (pg_column_size(estado) < 2000000),
  -- Nome e posição de quem está na partida: o link não lê `players`
  elenco       jsonb not null default '[]'::jsonb check (pg_column_size(elenco) < 500000),
  -- O aparelho que está marcando (id aleatório guardado nele)
  aparelho     text,
  aparelho_em  timestamptz,
  encerrada_em timestamptz,
  match_id     uuid references public.matches on delete set null,
  created_by   uuid default auth.uid() references public.profiles on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists partidas_ao_vivo_grupo_idx
  on public.partidas_ao_vivo (group_id, encerrada_em);

alter table public.partidas_ao_vivo enable row level security;

-- Os administradores leem (dono e organizador, com ou sem plano). Escrita só
-- pelas funções abaixo
drop policy if exists partidas_ao_vivo_ler on public.partidas_ao_vivo;
create policy partidas_ao_vivo_ler on public.partidas_ao_vivo
  for select using (public.e_admin_do_grupo(group_id));

-- ── Administrador ──

create or replace function public.criar_link_de_scout(
  p_group uuid, p_event uuid, p_sport text, p_estado jsonb, p_elenco jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l public.partidas_ao_vivo;
begin
  if not public.can_manage_group(p_group) then
    raise exception 'Sem permissão neste grupo';
  end if;
  insert into public.partidas_ao_vivo (group_id, event_id, sport, estado, elenco)
  values (p_group,
          (select id from public.events where id = p_event and group_id = p_group),
          coalesce(p_sport, 'volei'), p_estado, coalesce(p_elenco, '[]'::jsonb))
  returning * into l;
  return jsonb_build_object('id', l.id, 'token', l.token);
end;
$$;

-- Tira o aparelho do link: o próximo que abrir fica com ele
create or replace function public.liberar_link_de_scout(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  select group_id into g from public.partidas_ao_vivo where id = p_id;
  if g is null or not public.can_manage_group(g) then
    raise exception 'Sem permissão neste grupo';
  end if;
  update public.partidas_ao_vivo set aparelho = null, aparelho_em = null
   where id = p_id and encerrada_em is null;
end;
$$;

-- Grava a partida encerrada no histórico e fecha o link. `p_partida` nulo =
-- ninguém marcou ponto: fecha sem partida
create or replace function public.fechar_partida_ao_vivo(l public.partidas_ao_vivo, p_estado jsonb, p_partida jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare mid uuid;
begin
  if p_partida is not null then
    insert into public.matches
      (group_id, sport, played_at, event_id, dados, updated_at, created_by)
    values (l.group_id, l.sport,
            coalesce((p_partida ->> 'date')::timestamptz, l.created_at),
            l.event_id, p_partida, now(), l.created_by)
    returning id into mid;
  end if;
  update public.partidas_ao_vivo
     set estado = coalesce(p_estado, estado), encerrada_em = now(), updated_at = now(), match_id = mid
   where id = l.id;
end;
$$;
revoke execute on function public.fechar_partida_ao_vivo(public.partidas_ao_vivo, jsonb, jsonb) from public, anon, authenticated;

-- O administrador encerra no lugar do link (quem marcava sumiu, por exemplo)
create or replace function public.encerrar_partida_ao_vivo(p_id uuid, p_partida jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare l public.partidas_ao_vivo;
begin
  select * into l from public.partidas_ao_vivo where id = p_id for update;
  if l.id is null or not public.can_manage_group(l.group_id) then
    raise exception 'Sem permissão neste grupo';
  end if;
  if l.encerrada_em is not null then return; end if;
  perform public.fechar_partida_ao_vivo(l, null, p_partida);
end;
$$;

-- ── O link (sem conta) ──

-- Abre o link neste aparelho. Devolve o estado da partida, ou só a situação:
-- 'encerrada' (com o placar final) ou 'em_uso' (outro aparelho está marcando)
create or replace function public.guest_scout_abrir(p_token text, p_aparelho text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l public.partidas_ao_vivo; g public.groups;
begin
  if coalesce(length(p_aparelho), 0) < 16 then
    raise exception 'Aparelho inválido';
  end if;
  select * into l from public.partidas_ao_vivo where token = p_token for update;
  if l.id is null then
    raise exception 'Link inválido';
  end if;
  select * into g from public.groups where id = l.group_id;
  if l.encerrada_em is not null then
    return jsonb_build_object('situacao', 'encerrada', 'grupo', g.name, 'estado', l.estado,
                              'encerradaEm', l.encerrada_em);
  end if;
  if l.aparelho is not null and l.aparelho <> p_aparelho then
    return jsonb_build_object('situacao', 'em_uso', 'grupo', g.name);
  end if;
  update public.partidas_ao_vivo set aparelho = p_aparelho, aparelho_em = now() where id = l.id;
  return jsonb_build_object('situacao', 'aberta', 'grupo', g.name, 'estado', l.estado,
                            'elenco', l.elenco, 'atualizadaEm', l.updated_at);
end;
$$;

-- Cada ponto marcado no link sobe para cá. Devolve 'ok', 'em_uso' ou 'encerrada'
create or replace function public.guest_scout_salvar(p_token text, p_aparelho text, p_estado jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare l public.partidas_ao_vivo;
begin
  select * into l from public.partidas_ao_vivo where token = p_token for update;
  if l.id is null then raise exception 'Link inválido'; end if;
  if l.encerrada_em is not null then return 'encerrada'; end if;
  if l.aparelho is distinct from p_aparelho then return 'em_uso'; end if;
  update public.partidas_ao_vivo
     set estado = p_estado, updated_at = now(), aparelho_em = now()
   where id = l.id;
  return 'ok';
end;
$$;

create or replace function public.guest_scout_encerrar(p_token text, p_aparelho text, p_estado jsonb, p_partida jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare l public.partidas_ao_vivo;
begin
  select * into l from public.partidas_ao_vivo where token = p_token for update;
  if l.id is null then raise exception 'Link inválido'; end if;
  if l.encerrada_em is not null then return 'encerrada'; end if;
  if l.aparelho is distinct from p_aparelho then return 'em_uso'; end if;
  perform public.fechar_partida_ao_vivo(l, p_estado, p_partida);
  return 'ok';
end;
$$;

revoke execute on function public.criar_link_de_scout(uuid, uuid, text, jsonb, jsonb) from public, anon;
grant  execute on function public.criar_link_de_scout(uuid, uuid, text, jsonb, jsonb) to authenticated;
revoke execute on function public.liberar_link_de_scout(uuid)                         from public, anon;
grant  execute on function public.liberar_link_de_scout(uuid)                         to authenticated;
revoke execute on function public.encerrar_partida_ao_vivo(uuid, jsonb)               from public, anon;
grant  execute on function public.encerrar_partida_ao_vivo(uuid, jsonb)               to authenticated;
revoke execute on function public.guest_scout_abrir(text, text)                       from public;
grant  execute on function public.guest_scout_abrir(text, text)                       to anon, authenticated;
revoke execute on function public.guest_scout_salvar(text, text, jsonb)               from public;
grant  execute on function public.guest_scout_salvar(text, text, jsonb)               to anon, authenticated;
revoke execute on function public.guest_scout_encerrar(text, text, jsonb, jsonb)      from public;
grant  execute on function public.guest_scout_encerrar(text, text, jsonb, jsonb)      to anon, authenticated;
