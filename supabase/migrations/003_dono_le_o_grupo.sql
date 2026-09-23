-- ─────────────────────────────────────────────────────────────
-- 003 — O dono lê o próprio grupo
--
-- Sintoma: "Criar e gerar convites" falhava com erro de RLS.
--
-- O app cria o grupo com insert ... returning (precisa do id e do código).
-- O Postgres confere a política de LEITURA sobre a linha devolvida no
-- momento do insert — e a única política de leitura exigia ser membro.
-- Só que quem vira membro é o gatilho on_group_created, um AFTER INSERT, que
-- roda depois dessa conferência. O dono ainda não era membro e a linha
-- recém-criada era recusada.
--
-- Rodar uma vez no SQL Editor. Não apaga dados: só acrescenta uma política.
-- ─────────────────────────────────────────────────────────────

drop policy if exists groups_owner_read on public.groups;
create policy groups_owner_read on public.groups
  for select using (owner_id = auth.uid());
