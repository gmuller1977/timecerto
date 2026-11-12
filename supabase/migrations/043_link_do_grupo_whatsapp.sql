-- 043 · O link do grupo do WhatsApp
--
-- Pedido do Guilherme em 12/11/2026: o link de convite do grupo
-- (https://chat.whatsapp.com/...) salvo no grupo, para o botão "Acesso ao
-- grupo" do convidado que se inscreve pelo link de convidados.
--
-- O administrador cola o link em Ajustes. O link do atleta lê pela função
-- guest_link_do_grupo (nenhuma tabela aberta para anônimo).
--
-- Rodar uma vez no SQL Editor, DEPOIS da 041. Não apaga nem altera dados:
-- cria uma coluna (vazia) e uma função.

alter table public.groups
  add column if not exists link_whatsapp text
  check (link_whatsapp is null or link_whatsapp ~ '^https://chat\.whatsapp\.com/[A-Za-z0-9]+$');

create or replace function public.guest_link_do_grupo(code text)
returns text language plpgsql stable security definer set search_path = public as $$
declare r record;
begin
  select * into r from public.guest_resolve(code);
  return (select link_whatsapp from public.groups where id = r.gid);
end;
$$;

grant execute on function public.guest_link_do_grupo(text) to anon, authenticated;
