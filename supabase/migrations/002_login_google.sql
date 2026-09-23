-- ─────────────────────────────────────────────────────────────
-- 002 — Login do organizador pelo Google
--
-- Rodar uma vez no SQL Editor. Não apaga dados: troca uma função e tira
-- uma permissão.
-- ─────────────────────────────────────────────────────────────

-- 1. O Google manda o nome em full_name (e às vezes em name). O perfil usa o
--    que vier, e nunca fica sem nome — name é not null, e um insert que falha
--    aqui derruba o login inteiro.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Organizador'
    ),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 2. Fecha uma brecha. Com login Google aberto, qualquer pessoa que tenha o
--    código do grupo (ele vai no WhatsApp) poderia chamar join_group, virar
--    membro e ler pela RLS o cadastro inteiro dos atletas — nascimento de
--    menores e o token do link pessoal de cada um. O app não usa join_group.
--    Co-organizador, quando existir, entra por convite do dono, não por código.
revoke execute on function public.join_group(text) from public, anon, authenticated;
