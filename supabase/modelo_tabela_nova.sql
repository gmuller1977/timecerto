-- ─────────────────────────────────────────────────────────────
-- Modelo para migração que cria tabela (copie para a próxima
-- supabase/migrations/NNN_nome.sql e troque `nome_da_tabela`).
--
-- Desde 30/10/2026 o Supabase NÃO dá mais acesso automático pela API
-- (supabase-js, PostgREST) a tabela nova no schema public. Sem os GRANTs
-- abaixo, o app recebe "permission denied for table ...".
-- Tabelas criadas antes dessa data não mudam.
--
-- Regra do TimeCerto:
--   anon           nada. Os links do WhatsApp passam pelas funções guest_*
--                  (security definer), que não precisam de grant na tabela.
--   authenticated  só os verbos que o app usa direto (.from()) e que têm
--                  política RLS. Grant libera o verbo; a RLS decide a linha.
--   service_role   tudo. É a chave das Edge Functions.
-- Tabela que só é mexida por funções security definer: nenhum grant para
-- anon/authenticated, só service_role.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.nome_da_tabela (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.nome_da_tabela enable row level security;

drop policy if exists nome_da_tabela_ler on public.nome_da_tabela;
create policy nome_da_tabela_ler on public.nome_da_tabela
  for select using (public.is_group_member(group_id));

drop policy if exists nome_da_tabela_gravar on public.nome_da_tabela;
create policy nome_da_tabela_gravar on public.nome_da_tabela
  for all using (public.can_manage_group(group_id))
  with check (public.can_manage_group(group_id));

-- Grants: na MESMA migração que cria a tabela
grant select, insert, update, delete on public.nome_da_tabela to authenticated;
grant select, insert, update, delete on public.nome_da_tabela to service_role;
-- anon: não dê. Se um dia for preciso, explique aqui o porquê.

-- Coluna serial/bigserial (não identity): o insert também precisa da sequência
-- grant usage, select on sequence public.nome_da_tabela_id_seq to authenticated, service_role;
