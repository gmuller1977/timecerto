-- 025 · Excluir um grupo
--
-- Pedido do Guilherme em 30/09/2026: não havia como excluir um grupo pelo
-- app. A política groups_owner_delete deixava o dono apagar a linha, mas um
-- delete direto podia falhar no meio: o estorno aponta para o pagamento (e a
-- despesa) original com ON DELETE RESTRICT, e a cascata a partir do grupo
-- não tem ordem garantida.
--
-- Esta função faz a exclusão inteira, numa transação só:
--   - só o DONO;
--   - só com o nome do grupo digitado (a segunda trava, além da tela);
--   - estornos primeiro, depois o grupo — o resto vai em cascata (atletas,
--     jogos, respostas, partidas, cobranças, pagamentos, despesas, avisos,
--     administradores, convites).
--
-- Não tem volta: nada disso vai para lixeira.

create or replace function public.excluir_grupo(p_group uuid, p_confirmacao text)
returns void language plpgsql security definer set search_path = public as $$
declare g public.groups;
begin
  select * into g from public.groups where id = p_group;
  if g.id is null then
    raise exception 'Grupo não encontrado';
  end if;
  if g.owner_id is distinct from auth.uid() then
    raise exception 'Só o dono pode excluir o grupo.';
  end if;
  if lower(btrim(coalesce(p_confirmacao, ''))) <> lower(btrim(g.name)) then
    raise exception 'O nome digitado não confere com o do grupo.';
  end if;

  -- Os estornos travariam a cascata (ON DELETE RESTRICT no original)
  delete from public.pagamentos where group_id = p_group and estorno_de is not null;
  delete from public.despesas   where group_id = p_group and estorno_de is not null;

  delete from public.groups where id = p_group;
end;
$$;
revoke execute on function public.excluir_grupo(uuid, text) from public, anon;
grant  execute on function public.excluir_grupo(uuid, text) to authenticated;
