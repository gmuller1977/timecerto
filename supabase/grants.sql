-- ─────────────────────────────────────────────────────────────
-- Grants da API para todas as tabelas do TimeCerto.
--
-- Só é preciso ao RECRIAR o banco (projeto novo, branch de preview,
-- `supabase db reset`): desde 30/10/2026 o Supabase não dá mais acesso
-- automático a tabela nova no schema public. Rode no SQL Editor DEPOIS do
-- schema.sql e das migrações.
--
-- No projeto atual (whhvojozemwmnhnpyqpz) as tabelas antigas já têm acesso;
-- rodar aqui não muda nada (só concede, não revoga). anon fica de fora de
-- propósito: os links usam as funções guest_*.
-- ─────────────────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'groups', 'group_members', 'players', 'events', 'attendance',
    'squads', 'squad_players', 'matches', 'games', 'rallies', 'expenses',
    'payments', 'admin_invites', 'push_inscricoes', 'avisos', 'cobrancas',
    'pagamentos', 'despesas', 'lembretes', 'assinaturas', 'partidas_ao_vivo'
  ] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

-- Sem política RLS: só as funções security definer e as Edge Functions mexem
grant select, insert, update, delete on public.vip_teste to service_role;
