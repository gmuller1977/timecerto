# TimeCerto — contexto do projeto

PWA mobile-first de sorteio de times e scout ao vivo, em português do Brasil.
Esportes: futebol, vôlei, basquete. O vôlei é o mais desenvolvido.

Nome de trabalho — a marca ainda não está decidida.

## Comandos

```bash
npm run dev            # http://localhost:5173
npm run build          # tsc -b && vite build — SEMPRE rodar antes de dar algo por pronto
npm run preview        # serve o dist
npm run build:single   # index.html autocontido em dist-single/ (teste em celular)
```

## Stack

React 19 · TypeScript · Vite · Tailwind CSS v4 (plugin `@tailwindcss/vite`, sem
arquivo de config) · zustand com `persist` · react-router-dom (HashRouter) ·
lucide-react · Supabase (preparado, **inativo** — fase 2).

Alias `@/` aponta para `src/`.

## Estado atual

Tudo roda offline, em `localStorage`. Não existe backend, conta de usuário nem
sincronização. Dois aparelhos do mesmo dono são bases separadas. O esquema do
banco existe em `supabase/schema.sql` mas o app não fala com ele.

## Mapa

```
src/
  lib/
    sports.ts       Config de cada esporte: posições, tamanhos de time
    rotation.ts     Sistemas do vôlei (6x0, 4x2, 6x2, 5x1, fixo)
    draw.ts         Algoritmo de sorteio balanceado + cores de time
    volley.ts       Catálogo de fundamentos, regras de set
    volleyStats.ts  Estatísticas derivadas dos rallies + paleta dos gráficos
    stats.ts        Estatísticas genéricas (V/E/D, presença, sequência)
    share.ts        Texto formatado para WhatsApp
  store/
    useAppStore.ts    Jogadores, esporte, settings, elencos
    useMatchStore.ts  Partida ao vivo + partidas encerradas
    useHydrated.ts    Espera a leitura do localStorage — ver Armadilhas
  pages/            Uma página por rota
  components/
    ui/ players/ sports/ scout/ charts/
  types/index.ts    Todos os tipos do domínio
```

## Regras do domínio — não invente, confira aqui

### Sorteio (`lib/draw.ts`)

Quatro camadas, nesta ordem:

1. Goleiros (futebol) e levantadores (vôlei) primeiro, em serpentina do mais
   forte ao mais fraco. **Todos** os especialistas são distribuídos, não só os
   exigidos pelo sistema — sobrando levantadores, a diferença entre times nunca
   pode passar de 1. Concentrar especialistas foi um bug real, não repita.
2. O resto é ordenado por nível (5→1) com embaralhamento **dentro** de cada
   faixa. É isso que impede dois sorteios seguidos de darem o mesmo time.
3. Cada jogador entra no time com menor soma de estrelas que ainda tem vaga,
   com preferência por times que precisam da posição dele.
4. Roda 40 vezes e devolve o de menor desequilíbrio. Sai cedo no perfeito.

No vôlei, **o sistema de jogo manda no sorteio**: `settersNeeded(rotation)`
define quantos levantadores por time. 6x0 não reserva ninguém, 5x1 e fixo
pedem 1, 4x2 e 6x2 pedem 2. Não existe mais o toggle binário de levantador.

### Scout de vôlei (`lib/volley.ts`, `types/index.ts`)

O modelo inteiro se apoia numa dualidade: **todo ponto é mérito de quem marcou
(`kind: 'ponto'`) ou erro do adversário (`kind: 'erro'`).** Não existe terceira
opção. Toda estatística sai daí — não crie um terceiro tipo.

Os botões são ordenados por frequência real de jogo (ataque ~45%, erro de
ataque ~20%, erro de saque ~15%, bloqueio ~8%, ace ~5%). Ordem alfabética ou
"lógica" atrasa o registro e a pessoa abandona.

Três níveis de detalhe (`ScoutMode`): `placar` (1 toque), `time` (2 toques),
`atleta` (3 toques). Existem porque um set de 25 no modo atleta são 75 toques —
um técnico faz, um jogador de pelada não. Nunca remova a saída
"Só marcar o ponto": sem ela a pessoa trava e larga a ferramenta no meio.

Time convidado sem elenco cadastrado não recebe a pergunta de autoria.

### Dinheiro

Sempre em centavos, inteiro. Nunca float.

## Convenções

Interface e comentários em **português**. Nomes de código em inglês quando for
termo técnico (`playerId`, `teamSize`), em português quando for domínio
brasileiro (`levantador`, `rodizio`).

Mobile-first. Alvos de toque grandes — o app é usado em pé, olhando para a
quadra. Largura de referência: 390px.

Tema escuro, único. Tokens em `src/index.css` sob `@theme`: `brand-*` (verde)
e `ink-*` (cinzas). Não use cores cruas do Tailwind para a interface.

Gráficos usam a paleta validada em `lib/volleyStats.ts` (`SERIES`, `STATUS`) —
ela passou por checagem de contraste e daltonismo contra o fundo escuro. Não
troque por cores escolhidas no olho.

Nunca deixe o número sozinho. Toda estatística vem com a leitura do que ela
significa — é isso que separa este app de um placar.

## Armadilhas já pagas

**Hidratação.** `localStorage` não é lido instantaneamente. Qualquer página que
redirecione quando não encontra algo (`<Navigate>`) precisa esperar
`useHydrated()` antes de decidir. Sem isso o app expulsa o usuário para a home
e — pior — perde a partida em andamento quando o app é reaberto.

**Corrida de redirecionamento.** Ao encerrar a partida, o store zera `live` e o
redirecionamento de segurança do placar dispara antes da navegação chegar,
engolindo a tela de resumo. `ScoreboardPage` usa um estado `leaving` para isso.

**Overflow horizontal.** Linha com botão de largura fixa ao lado de conteúdo
flexível estoura a viewport no celular. Use `flex-wrap`, `min-w-0` e `shrink-0`.

## Testes

Não há suíte automatizada. O padrão usado até aqui, e que funciona bem:

- Lógica pura (sorteio, estatísticas): script `tsx` avulso com cenários
  montados à mão, rodado com `npx tsx --tsconfig tsconfig.app.json`, conferindo
  invariantes (quantos levantadores por time, se todos foram alocados, se a
  variedade entre sorteios é suficiente). Foi assim que os bugs do sorteio
  apareceram.
- Fluxo de tela: Playwright em viewport 390x844 contra `npm run preview`,
  clicando o caminho real e tirando screenshot. Foi assim que os dois bugs de
  navegação apareceram. Escute `pageerror` e `console`.

Apague os scripts de teste avulsos antes de commitar.

## Deploy

GitHub `gmuller1977/timecerto` → Vercel, build automático no push para `main`.
Produção: https://timecerto-theta.vercel.app

`vercel.json` define build, headers do manifest e cache dos assets.

## Fase 2 — o que falta

Login, grupos compartilhados, sincronização, financeiro do grupo, ranking.
O esquema está em `supabase/schema.sql` com RLS por grupo e papéis
(dono/organizador/jogador) e função `join_group` por código de convite.

O ponto mais delicado dessa fase: **o scout não pode parar por falta de
internet.** Ginásio tem sinal ruim. Qualquer sincronização precisa ser
otimista, com fila local e reconciliação depois — nunca bloquear o registro
de um ponto esperando rede.
