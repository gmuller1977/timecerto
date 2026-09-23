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

O app roda offline, em `localStorage`, e continua funcionando sem login.
O Supabase (projeto `whhvojozemwmnhnpyqpz`) entra só para **login do
organizador e convites** — ver "Convites" abaixo. Partidas e estatísticas ainda
não sobem: dois aparelhos do mesmo dono são bases separadas.

`.env` local tem `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (a publishable
key). Na Vercel, as mesmas duas em Settings → Environment Variables. A secret
key nunca vai para o app.

## Convites

Só o administrador (amador) e o técnico (profissional) têm conta — login pela
**conta Google** (`/entrar`), decidido pelo Guilherme em 23/09/2026. E-mail
com código foi descartado: ninguém quer esperar e-mail para entrar.

O Google devolve para `#/entrar?volta=…` com `?code=` na query (PKCE). A volta
cai em `/entrar` de propósito: é a tela carregada sob demanda que traz o
cliente do Supabase, e só ele troca o código pela sessão. Voltar para a home
deixaria o código sem ninguém para lê-lo.

`join_group` está sem permissão para todos: com login aberto, quem tem o
código do grupo (vai no WhatsApp) viraria membro e leria pela RLS o cadastro
dos atletas, inclusive nascimento de menores e os tokens pessoais.

Jogador e atleta **nunca criam conta**. Entram pelo link do WhatsApp:

- `/#/c/CÓDIGO` — link dos **mensalistas** (amador): escolhe o próprio nome
  (o aparelho lembra), marca vou / não vou, e pode "levar alguém de fora", que
  entra na fila de convidados. Qualquer um com o link marca por qualquer um;
  aceito, o organizador vê a lista.
- `/#/v/CÓDIGO` — link de **convidados** (amador, `groups.guest_code`): põe o
  nome e entra na fila. Nome de convidado que já existe = a mesma pessoa
  voltando; nome de mensalista é recusado.
- `/#/a/TOKEN` — link pessoal do atleta: completa nascimento, altura e peso.
  Menor de idade exige o aceite do responsável (LGPD).

### Mensalistas e convidados (amador)

Decidido pelo Guilherme em 23/09/2026. O **administrador define no cadastro**
quem é mensalista e quem é convidado (`Player.kind`; ausente = mensalista).

- O jogo tem **vagas** (`events.slots`; nulo = sem limite).
- **Mensalista que confirma sempre joga**, mesmo acima das vagas.
- **Convidado entra numa fila** por ordem de resposta e joga só se sobrar vaga.
  Mensalista desistiu, o primeiro da fila entra sozinho.
- Convidado chega pelo organizador, por um mensalista ou se inscrevendo sozinho.

**A fila não é guardada**: sai de `answered_at`, calculada por
`distribuirVagas` em `lib/vagas.ts`. É a única implementação — a tela do
organizador e os dois links chamam ela. `answered_at` só muda quando a resposta
muda: apertar "vou" de novo não pode jogar o convidado para o fim da fila.

"Usar respostas na lista de presença" marca para o sorteio só quem **tem vaga**
(`joga()`); fila e "não vou" saem; sem resposta fica como está.

Pagamento (mensalidade, avulso) fica para a etapa do financeiro.

### Roteiro do Amador

O foco atual é o **modo amador**; o profissional espera. Ordem combinada:

1. Mensalistas e convidados — **feito**
2. Do convite ao sorteio: fechar a lista, sortear só quem tem vaga, times no link
3. Partidas na nuvem: resultados e estatística no link, histórico em outro aparelho
4. Financeiro: mensalidade, avulso, Pix, quem pagou
5. Acabamento: co-organizador, offline no ginásio (service worker), avisos

Todo acesso do convidado passa pelas funções `guest_*` do esquema, que
conferem código ou token. **Nenhuma tabela é aberta para `anon`** — não
crie política para `anon`; crie uma função `guest_*` nova.

O aparelho continua a fonte de verdade do elenco; a nuvem recebe uma cópia
(`lib/cloud.ts`, `syncAmador`/`syncPro`). O id da nuvem nasce no aparelho
(`crypto.randomUUID`, guardado em `remoteId`) para um upsert só resolver novos
e existentes. Na sincronização do atleta, nascimento/altura/peso da nuvem
vencem (quem preencheu foi o atleta); o resto vai do aparelho para a nuvem.

As telas que falam com o banco são carregadas sob demanda (`lazy` em
`App.tsx`): o cliente do Supabase não entra no pacote do placar.

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
    court.ts        Quadra, rodízio, validação da escalação
    pro.ts          Categorias, naipe, idade, atleta → Player
  store/
    useAppStore.ts    Jogadores amadores, esporte, settings, elencos
    useProStore.ts    Elenco profissional, filtro, última escalação
    useMatchStore.ts  Partida ao vivo + partidas encerradas
    useRoster.ts      Os dois cadastros juntos, para achar nome por id
    useHydrated.ts    Espera a leitura do localStorage — ver Armadilhas
  pages/            Uma página por rota
  components/
    ui/ players/ sports/ scout/ charts/
  types/index.ts    Todos os tipos do domínio
```

## Dois modos

A rota `/` é um menu com **Amador** e **Profissional**. `useAppStore.mode`
guarda a escolha.

- **Amador** (`/amador`) — pelada: cadastro, presença, sorteio, placar.
  Os três esportes.
- **Profissional** (`/profissional`) — treinador: elenco com categoria,
  naipe, nascimento, altura, peso e posição; escalação manual
  (`/profissional/escalacao`) com quadra, reservas, líbero, rodízio, placar e
  scout já em modo atleta. **Só vôlei** — entrar nesse modo força
  `sport = 'volei'`.

**Os cadastros são separados — são praticamente dois apps.** O amador vive em
`useAppStore.players` (e no futuro será confirmado por link no WhatsApp); o
profissional em `useProStore` (`timecerto:pro:v1`), com dados que ninguém
pede numa pelada. Um não aparece no outro.

O que ainda é compartilhado é o motor da partida: placar, scout, resumo e
estatística falam `Player`. O atleta profissional entra neles por
`proToPlayer`, e essas telas acham nomes por `useRoster()`, que junta os dois
cadastros. Não leia `useAppStore.players` numa tela de partida — o nome do
atleta profissional some.

A partida encerrada guarda `Match.mode`; o histórico de cada modo mostra só as
suas. Partida sem `mode` é de antes da separação e conta como amador.

**Idade nunca é guardada**: guarda-se `birthDate` e `ageOn` calcula. A
categoria é sugerida pelo **ano** de nascimento (`suggestAgeGroup`), como as
federações contam — Sub-17 é quem completa no máximo 16 no ano. Master nunca
é sugerido, é escolha. Depois que alguém escolhe a categoria à mão, a data não
a sobrescreve; o formulário só mostra a sugestão ao lado.

O filtro de categoria e naipe do elenco é o mesmo recorte que a escalação usa
como "disponíveis".

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

### Quadra e rodízio (`lib/court.ts`)

Numeração oficial: `4 3 2` na rede, `5 6 1` no fundo. **A 1 saca.** O rodízio é
horário — quem está na 2 vai para a 1, a 1 vai para a 6, e assim por diante.
`rotateCourt` implementa isso; seis chamadas voltam ao início.

`validateLineup` cobra o sistema de jogo: número de levantadores em quadra,
posições vazias, jogador repetido, e avisa quando os dois levantadores de um
4x2/6x2 não estão opostos (três posições de distância no ciclo `1,6,5,4,3,2`).

Erro bloqueia o início da partida; aviso só alerta.

### Quadra durante a partida

**Quem está onde é DERIVADO dos rallies, nunca guardado.** O set guarda só
`Game.lineup`: a quadra do primeiro saque, quem sacou primeiro e a lista de
substituições com o rally em que cada uma entrou. `courtStateAt` refaz o set
a cada render. É isso que mantém o `undoRally` certo sem código extra — guardar
a quadra atual exigiria desfazer rodízio à mão.

O time gira só no **side-out**: ganhar o ponto sobre o saque do adversário.
Ponto no próprio saque mantém o sacador. O sistema `fixo` conta a rotação mas
não mexe na quadra.

Antes do primeiro ponto do set, trocar alguém de lugar é **ajuste de
escalação** (`setStartCourt`) e não gasta substituição; o primeiro saque também
só pode ser escolhido nessa hora. Depois, é `substitute`, contado contra o
limite de 6 por set — o app avisa quando passa, mas não bloqueia.

O set seguinte começa com a escalação **inicial** do anterior e o primeiro
saque alternado. Desfazer tira primeiro a substituição feita depois do último
ponto, e só então o ponto.

No scout do atleta, "quem fez?" lista só quem está em quadra mais o líbero.

### Correção do placar

No cartão de cada time, **+** fica acima do número e **−** abaixo, nos dois
modos; o meio do cartão continua sendo o toque que abre o scout. O `+` marca um
ponto `indefinido`, sem abrir o scout. O `−` (`removePoint`) tira o **último
ponto daquele time**, mesmo que não seja o último rally: reconta o placar
gravado nos rallies seguintes, puxa uma casa para trás as substituições feitas
depois dele e reabre o set se ele tinha fechado. Como a quadra é derivada,
rodízio e saque se corrigem sozinhos.

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

Feito: login do organizador, grupo na nuvem, convites e presença.
Falta: subir partidas (sem isso `guest_matches` devolve vazio e o convidado
não vê resultados), login por WhatsApp, financeiro do grupo, ranking.
O esquema está em `supabase/schema.sql` com RLS por grupo e papéis
(dono/organizador/jogador).

O ponto mais delicado dessa fase: **o scout não pode parar por falta de
internet.** Ginásio tem sinal ruim. Qualquer sincronização precisa ser
otimista, com fila local e reconciliação depois — nunca bloquear o registro
de um ponto esperando rede.
