---
name: supabase-timecerto
description: Convenções do banco e da sincronização do TimeCerto no Supabase — esquema, RLS, offline-first e migração dos dados locais. Use ao mexer em supabase/schema.sql, em qualquer acesso ao banco, autenticação ou sincronização.
---

# Supabase no TimeCerto

Estado: esquema rodado no projeto `whhvojozemwmnhnpyqpz`. O app usa o banco
para login do organizador e convites (ver "Convites" no CLAUDE.md); partidas
ainda não sobem.
`lib/supabase.ts` exporta `null` quando as variáveis não existem, e
`isSupabaseConfigured` diz se dá para usar. Todo código novo deve funcionar com
`supabase === null` — o modo offline não é fallback, é o padrão atual.

Variáveis: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. Nunca comitar.
Na Vercel, cadastrar em Settings → Environment Variables.

## Modelo

`groups` é a unidade de compartilhamento — a pelada ou o time. Tudo pendura
nele por `group_id`.

`players` **não** é `profiles`. A maioria dos jogadores de uma pelada nunca vai
criar conta. `players.user_id` é opcional e só liga quando a pessoa entra no
app. Nunca exija conta para alguém existir como jogador — isso mataria o
cadastro em massa, que é o que tira o atrito do organizador.

`matches.teams` é `jsonb`: foto dos times no dia. Histórico não pode mudar
quando alguém renomeia um time ou sai do grupo.

`rallies` é a tabela que mais cresce. Um set de 25 gera ~45 linhas. Índices em
`game_id` e `player_id` já existem.

Dinheiro em `bigint` de centavos, sempre. `expenses.amount_cents`,
`payments.amount_cents`.

## RLS

Ligada em todas as tabelas. Sem ela, qualquer um com a chave pública lê o banco
inteiro — a chave anon vai no bundle do navegador, ela é pública por natureza.

Duas funções `security definer` fazem o trabalho:

- `is_group_member(gid)` — leitura
- `can_manage_group(gid)` — escrita (papéis `dono` e `organizador`)

**Elas existem para evitar recursão infinita.** Uma política em
`group_members` que precise consultar `group_members` trava o Postgres. Toda
política nova que dependa de participação no grupo deve usar essas funções, não
um `exists` direto.

`games` e `rallies` não têm `group_id`; herdam via `match_group(match_id)` e
`game_group(game_id)`.

Papéis: `dono`, `organizador`, `jogador`. Jogador lê, organizador escreve.

Entrada no grupo é pela função `join_group(code)`, `security definer` — o
usuário não precisa enxergar `groups` antes de ser membro. O código de convite
é curto de propósito: ele vai num link de WhatsApp.

## Sincronização — a restrição que manda

**O scout não pode parar por falta de internet.** Ginásio tem sinal ruim e o
rally não espera. Qualquer coisa que bloqueie o registro de um ponto aguardando
rede está errada, por mais correta que pareça.

Consequências:

- Escrita é otimista: grava no store local, enfileira, sincroniza depois.
- `localStorage` continua sendo a fonte de verdade durante a partida.
- Reconciliação acontece ao encerrar ou quando a rede volta, nunca no meio.
- Conflito entre dois organizadores: a partida pertence a quem a iniciou;
  não tente mesclar rallies de duas fontes no mesmo set.

Realtime só para coisas fora do jogo (lista de presença, confirmações). Não
assine rallies ao vivo — o custo não paga o benefício e adiciona um ponto de
falha no momento mais crítico.

## Migração dos dados locais

Todo mundo que já usa o app tem dados em `localStorage` (chaves
`timecerto:v1` e `timecerto:matches:v1`). Ao introduzir conta, esses dados
precisam virar um grupo do usuário, não sumir.

Fluxo: criar conta → criar grupo → subir jogadores, elencos e partidas locais
→ marcar como migrado. Nunca apagar o local antes de confirmar que subiu.

## Hidratação

Continua valendo depois do Supabase: `useHydrated()` espera o `localStorage`.
Com o banco, vai existir um segundo estado de espera (sessão de auth) — não
redirecione nem decida "não existe" enquanto qualquer um dos dois estiver
carregando. Esse bug já custou a perda da partida em andamento uma vez.
