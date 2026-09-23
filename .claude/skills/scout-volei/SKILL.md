---
name: scout-volei
description: Modelo de dados e regras do scout de vôlei do TimeCerto — rallies, fundamentos, sistemas de rodízio e estatísticas derivadas. Use ao mexer no placar ao vivo, no registro de pontos, nos sistemas de jogo ou em qualquer cálculo de estatística.
---

# Scout de vôlei

"Scout" aqui é o termo técnico do vôlei: anotar cada ponto da partida ao vivo,
classificando como aconteceu. Não é descoberta de talentos.

## A dualidade que sustenta tudo

**Todo ponto é mérito de quem marcou ou erro de quem perdeu. Não há terceira
opção.** O `Rally` carrega `kind: 'ponto' | 'erro'`, sempre com `teamId` sendo
**quem ganhou o ponto** — inclusive quando `kind` é `'erro'`, caso em que a
ação descreve a falha do adversário.

Consequência prática: os erros de um time são os rallies em que o *outro* time
pontuou com `kind: 'erro'`. É assim que `errorsOf` e `teamScout` calculam.

Nunca acrescente um terceiro `kind`. Toda estatística do app sai dessa
separação — perdê-la quebra o resumo da partida inteiro.

## Tipos

```ts
Rally  { id, teamId, kind, action, playerId?, scoreA, scoreB, at }
Game   { id, teamAId, teamBId, scoreA, scoreB, played, finished?, rallies? }
Match  { id, date, sport, teams, games, scorers, attendance, drawId?, notes? }
```

`Game` é um set no vôlei e um jogo no futebol. `Match.teams` é uma **foto** dos
times no dia: nomes e elencos mudam, o histórico não pode mudar junto.

## Fundamentos

Catálogo em `lib/volley.ts`: `POINT_ACTIONS` (ataque, bloqueio, ace) e
`ERROR_ACTIONS` (ataque fora, saque, recepção, rede/invasão, bola no chão,
levantamento).

**A ordem é por frequência real de jogo, não alfabética nem "lógica":**
ataque ~45% dos pontos, erro de ataque ~20%, erro de saque ~15%, bloqueio ~8%,
ace ~5%. Reordenar por estética atrasa o registro e faz a pessoa desistir.

`'indefinido'` é a ação de quem só marcou o ponto sem classificar. É legítima e
precisa continuar existindo — no meio do rally nem sempre dá para classificar,
e sem essa saída o scout é abandonado no ponto 4. `hasDetail()` filtra partidas
que só têm `indefinido`.

## Níveis de detalhe

`ScoutMode`: `placar` (1 toque por ponto), `time` (2 toques), `atleta`
(3 toques). Padrão é `time`.

Existem porque um set de 25 no modo atleta são 75 toques. Um técnico faz; um
jogador de pelada, no meio do jogo, não. Não unifique.

Time sem elenco cadastrado (adversário convidado) **não** recebe a pergunta de
autoria, mesmo no modo atleta — ver `PointSheet.pick`.

## Regras de set

`isSetOver(scoreA, scoreB, settings)` em `lib/volley.ts`. Configurável:
`pointsToWin` (12/15/21/25), `winByTwo`, `cap`. Vantagem de 2 é o padrão.

## Sistemas de rodízio

`lib/rotation.ts`. O que o app precisa de cada um é **quantos levantadores o
time exige** — é isso que alimenta o sorteio.

| Sistema | Levantadores | O que é |
|---|---|---|
| 6x0 | 0 | Quem chega na frente levanta. Iniciação. |
| 4x2 | 2 | Dois levantadores opostos no rodízio, o da frente levanta. |
| 6x2 | 2 | Levantador do fundo penetra; sempre 3 atacantes na frente. |
| 5x1 | 1 | Um levantador nas seis rotações. Padrão moderno. |
| fixo | 1 | Levantador parado no meio, sem rodízio. Convenção de pelada. |

`fixo` não é sistema oficial — é como boa parte das peladas brasileiras joga de
verdade, e por isso é opção de primeira classe. Manter.

## Estatísticas

`lib/volleyStats.ts`:

- `teamScout(match, teamId)` → `earned` (mérito), `gifted` (recebido de erro
  do adversário), `errors` (cometidos), `efficiency` = mérito ÷ (mérito+erro),
  `giftedShare` = quanto dos pontos veio de graça.
- `playerScouts(matches)` → por jogador: pontos, erros e **`balance`**
  (pontos − erros), a conta mais honesta do vôlei.
- `readGiftedShare(share)` → a frase que interpreta o número.

`efficiency` importa mais que pontos absolutos: 15 pontos com 15 erros não é o
mesmo que 15 com 3.

`lib/stats.ts` cuida do genérico (V/E/D, aproveitamento por pontos corridos,
presença, sequência). `MIN_GAMES_FOR_RATE` evita que quem jogou um confronto
lidere ranking de média.

## Partida ao vivo

`store/useMatchStore.ts`. A partida em andamento fica em `live` e é
persistida — fechar o app no meio do set não pode perder o jogo.

`undoRally` volta um ponto e, se o set atual está vazio, volta para o set
anterior. É usado o tempo todo na prática; não quebre.

`finishMatch` só salva sets que têm rallies.
