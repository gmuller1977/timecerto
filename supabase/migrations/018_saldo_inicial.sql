-- ─────────────────────────────────────────────────────────────
-- 018 — Saldo inicial do caixa
--
-- Pedido do Guilherme em 29/09/2026: o grupo já tinha dinheiro (ou dívida)
-- quando começou a usar o app. Com o saldo inicial e a data dele, o
-- Financeiro mostra quanto há EM CAIXA:
--
--   em caixa = saldo inicial + o que entrou − o que saiu, a partir da data
--
-- Pagamentos e despesas antes da data não entram: já estão no saldo inicial.
-- Pode ser negativo — o grupo que começa devendo a quadra.
--
-- Rodar uma vez no SQL Editor, DEPOIS da 017. Não apaga dados: acrescenta
-- duas colunas em `groups`. Quem grava é o dono ou um administrador, pela
-- política que já existe (groups_manage).
-- ─────────────────────────────────────────────────────────────

alter table public.groups
  add column if not exists caixa_inicial_cents int
    check (caixa_inicial_cents is null or caixa_inicial_cents between -100000000 and 100000000),
  add column if not exists caixa_inicial_em date;
