-- 034 · O mesmo celular recebe os avisos de atleta E os de administrador
--
-- Relatado pelo Guilherme em 05/10/2026: ele é administrador e joga, e só
-- recebia os avisos de administrador. O endereço de entrega (endpoint) era
-- único em push_inscricoes, e cada celular tem um endereço só — então ativar
-- os avisos em Ajustes TROCAVA a inscrição de atleta daquele celular pela de
-- administrador (e o contrário). Valia o último a ser ativado, e o link
-- continuava dizendo "Avisos ativados", porque o celular lembrava.
--
-- Agora o celular pode ter uma inscrição de cada papel. Continua UMA pessoa
-- por papel: num celular emprestado, ativar como outro atleta troca o atleta,
-- e ninguém recebe aviso de duas pessoas.
--
-- Rodar uma vez no SQL Editor, DEPOIS da 033. Não apaga dados: troca a regra
-- de unicidade da tabela e as duas funções que inscrevem.

-- A regra antiga: um endereço, uma inscrição
do $$
declare c text;
begin
  for c in
    select con.conname from pg_constraint con
     where con.conrelid = 'public.push_inscricoes'::regclass and con.contype = 'u'
       and pg_get_constraintdef(con.oid) = 'UNIQUE (endpoint)'
  loop
    execute format('alter table public.push_inscricoes drop constraint %I', c);
  end loop;
end;
$$;

-- A nova: um atleta e um administrador por endereço
create unique index if not exists push_um_atleta_por_aparelho
  on public.push_inscricoes (endpoint) where player_id is not null;
create unique index if not exists push_um_admin_por_aparelho
  on public.push_inscricoes (endpoint) where user_id is not null;

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
  on conflict (endpoint) where player_id is not null do update
    set group_id = excluded.group_id, player_id = excluded.player_id,
        p256dh = excluded.p256dh, auth = excluded.auth, criado_em = now();
  delete from public.push_inscricoes
   where id in (select id from public.push_inscricoes where player_id = p_player
                 order by criado_em desc offset 5);
end;
$$;

create or replace function public.inscrever_admin(
  p_group uuid, p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_group(p_group) then
    raise exception 'Sem permissão neste grupo';
  end if;
  insert into public.push_inscricoes (group_id, user_id, endpoint, p256dh, auth)
  values (p_group, auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) where user_id is not null do update
    set group_id = excluded.group_id, user_id = excluded.user_id,
        p256dh = excluded.p256dh, auth = excluded.auth, criado_em = now();
  delete from public.push_inscricoes
   where id in (select id from public.push_inscricoes where user_id = auth.uid()
                 order by criado_em desc offset 5);
end;
$$;
