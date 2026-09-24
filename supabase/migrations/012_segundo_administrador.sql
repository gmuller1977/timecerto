-- ─────────────────────────────────────────────────────────────
-- 012 — Segundo administrador, com convite por link
--
-- Pedido do Guilherme em 24/09/2026. O papel 'organizador' já existia em
-- group_members, e can_manage_group já deixa ele gravar atletas, jogos,
-- respostas e times. Faltava como alguém VIRAR organizador: join_group foi
-- desligado porque o código do grupo circula no WhatsApp.
--
-- Decidido:
--   * o administrador convidado faz tudo do dia a dia; só o DONO convida e
--     remove administradores — ninguém tira o dono do próprio grupo;
--   * o link é de USO ÚNICO e vale 48 h. Ele dá poder de administrador: se
--     vazar no grupo do WhatsApp, não pode transformar mais ninguém.
--
-- Corrige também uma brecha: a política members_manage deixava qualquer
-- organizador mexer em group_members — inclusive remover o dono. Não havia
-- organizador até agora, então nunca aconteceu.
--
-- Rodar uma vez no SQL Editor, DEPOIS da 011. Não apaga dados: cria uma
-- tabela, troca uma política por duas e cria quatro funções.
-- ─────────────────────────────────────────────────────────────

create or replace function public.is_group_owner(gid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.groups where id = gid and owner_id = auth.uid());
$$;

-- ── Quem mexe em quem é administrador ──
-- Só o dono gerencia membros. Qualquer um pode sair sozinho — menos o dono.
drop policy if exists members_manage on public.group_members;
drop policy if exists members_owner_manage on public.group_members;
create policy members_owner_manage on public.group_members
  for all using (public.is_group_owner(group_id))
  with check (public.is_group_owner(group_id));

drop policy if exists members_self_leave on public.group_members;
create policy members_self_leave on public.group_members
  for delete using (user_id = auth.uid() and role <> 'dono');

-- ── Convites de administrador ──
create table if not exists public.admin_invites (
  -- 64 caracteres aleatórios: o link é a única barreira
  token      text primary key
             default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  group_id   uuid not null references public.groups on delete cascade,
  created_by uuid not null default auth.uid() references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '48 hours',
  used_by    uuid references public.profiles on delete set null,
  used_at    timestamptz
);

alter table public.admin_invites enable row level security;

-- Só o dono cria, vê e cancela os convites do grupo dele
drop policy if exists admin_invites_owner on public.admin_invites;
create policy admin_invites_owner on public.admin_invites
  for all using (public.is_group_owner(group_id))
  with check (public.is_group_owner(group_id));

-- O que o link mostra antes de aceitar: só o nome do grupo e se ainda vale.
-- Aberto a quem não entrou ainda, para a tela dizer de qual grupo é o convite.
create or replace function public.convite_admin_info(p_token text)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare i public.admin_invites; g public.groups;
begin
  select * into i from public.admin_invites where token = p_token;
  if i.token is null then
    raise exception 'Convite inválido';
  end if;
  select * into g from public.groups where id = i.group_id;
  return jsonb_build_object(
    'group', g.name,
    'mode', g.mode,
    'expirado', i.expires_at < now(),
    'usado', i.used_at is not null,
    'usadoPorMim', i.used_by is not null and i.used_by = auth.uid());
end;
$$;

-- Aceitar: vira organizador do grupo e o convite fica gasto. Quem já é
-- membro continua com o papel que tem (o dono não vira organizador).
create or replace function public.aceitar_convite_admin(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare i public.admin_invites; g public.groups; eu uuid := auth.uid();
begin
  if eu is null then
    raise exception 'Entre com sua conta para aceitar o convite';
  end if;
  select * into i from public.admin_invites where token = p_token for update;
  if i.token is null then
    raise exception 'Convite inválido';
  end if;
  if i.used_at is not null and i.used_by is distinct from eu then
    raise exception 'Este convite já foi usado. Peça outro ao dono do grupo.';
  end if;
  if i.used_at is null and i.expires_at < now() then
    raise exception 'Este convite expirou. Peça outro ao dono do grupo.';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (i.group_id, eu, 'organizador')
  on conflict (group_id, user_id) do nothing;

  update public.admin_invites set used_by = eu, used_at = now()
   where token = p_token and used_at is null;

  select * into g from public.groups where id = i.group_id;
  return jsonb_build_object('group', g.name, 'mode', g.mode);
end;
$$;

-- Os administradores do grupo, com nome e foto — para a lista em Ajustes.
-- profiles só deixa cada um ler o próprio; esta função mostra os do grupo
-- a quem é membro dele.
create or replace function public.admins_do_grupo(gid uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_group_member(gid) then
    raise exception 'Sem permissão neste grupo';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'userId', m.user_id, 'role', m.role, 'name', p.name,
             'avatarUrl', p.avatar_url, 'desde', m.created_at, 'souEu', m.user_id = auth.uid())
           order by (m.role = 'dono') desc, m.created_at)
      from public.group_members m
      join public.profiles p on p.id = m.user_id
     where m.group_id = gid and m.role in ('dono', 'organizador')
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.is_group_owner(uuid)          from public, anon;
grant  execute on function public.is_group_owner(uuid)          to authenticated;
revoke execute on function public.convite_admin_info(text)      from public;
grant  execute on function public.convite_admin_info(text)      to anon, authenticated;
revoke execute on function public.aceitar_convite_admin(text)   from public, anon;
grant  execute on function public.aceitar_convite_admin(text)   to authenticated;
revoke execute on function public.admins_do_grupo(uuid)         from public, anon;
grant  execute on function public.admins_do_grupo(uuid)         to authenticated;
