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
- `/#/r/CÓDIGO` — link de **cadastro de mensalistas** (`groups.register_code`):
  nome, **apelido**, nascimento, telefone, posição e nível. Fica **pendente**
  (`players.pending`) até o administrador aprovar no topo de Atletas; pendente
  não aparece em link nenhum nem entra no sorteio. O nível é sugestão — o
  sorteio usa o que o administrador deixar.
- `/#/a/TOKEN` — link pessoal do atleta: completa nascimento, altura e peso.
  Menor de idade exige o aceite do responsável (LGPD).

**Telefone e nascimento nunca saem pelas funções `guest_*`.** Só o
administrador vê, na ficha do jogador (`PlayerSheet`).

**Apelido** (`Player.nickname`, opcional): na pelada é o nome de verdade, então
aparece no lugar do nome em listas, links, times, WhatsApp e placar —
`nomeDeExibicao` em `lib/nome.ts`; nos links, `guest_group` faz a mesma conta.
As telas de partida recebem o apelido pronto de `useRoster`. O nome completo
fica na ficha.

### Fluxo do administrador (amador)

Definido pelo Guilherme em 23/09/2026. A tela Convites deixou de existir no
amador em 24/09/2026 (etapa 3 de `docs/telas-amador.md`); o fluxo é o mesmo,
em dois lugares:

- **Atletas** (a aba se chamava Elenco; a rota continua `/elenco`): 1. **Convidar** no cabeçalho manda o link de cadastro
  (`ConvidarSheet`); 2. os pedidos aparecem no topo, em âmbar, com aprovar e
  recusar na linha; tocar num jogador abre a ficha.
- **Jogo, bloco do jogo no topo** (`components/jogo/JogoBloco.tsx`, e a parte
  dos links em `components/cloud/JogoNuvem.tsx`): 3. cria o jogo: data,
  horário, **local** e vagas; 4. **Convidar mensalistas** e **Convidar
  convidados**; 5. as respostas entram na lista do Jogo e atualizam sozinhas a
  cada 20 s com a lista aberta; 6. **Fechar a lista e sortear** (no rodapé)
  leva ao sorteio só quem tem vaga.
- 7. no resultado, **Publicar os times no link** — todo mundo vê pelos dois links.

`/convites` ficou só para o profissional; no amador leva ao Jogo. Conta (sair)
fica em Ajustes › Conta.

**Ao abrir, o Jogo e o Elenco só LEEM da nuvem.** `syncAmador` sobe o elenco e
**aposenta na nuvem quem não está no aparelho**. Enquanto ele rodava ao abrir a
tela Convites, um segundo aparelho com elenco vazio apagava os links ao abrir
aquela tela; com o cartão no Jogo, isso seria toda abertura do app. Ele roda só
em gestos explícitos: criar grupo, abrir jogo, convidar, aprovar, recusar e o ↻.
O convite abre o WhatsApp ANTES de subir — depois de um `await` o navegador
pode barrar a janela.

O Supabase só carrega para quem tem sessão salva (`lib/sessao.ts`): quem nunca
entrou vê no Jogo uma linha leve de "Entrar", sem os 200 kB.

No link, reabrir mostra a resposta atual, deixa mudar e mostra quem confirmou.

### Mensalistas e convidados (amador)

Decidido pelo Guilherme em 23/09/2026. O **administrador define no cadastro**
quem é mensalista e quem é convidado (`Player.kind`; ausente = mensalista).

- O jogo tem **vagas** (`events.slots`; nulo = sem limite).
- **Mensalista que confirma sempre joga**, mesmo acima das vagas.
- **Convidado entra numa fila** por ordem de resposta e joga só se sobrar vaga.
  Mensalista desistiu, o primeiro da fila entra sozinho.
- Convidado chega pelo organizador, por um mensalista ou se inscrevendo sozinho.

**A fila não é guardada**: é calculada por `distribuirVagas` em
`lib/vagas.ts`, a única implementação da regra. Os links a chamam com
`answered_at`; o aparelho, por `vagasDoJogo`, com o `seq` do Jogo. A ordem só
muda quando a resposta muda: apertar "vou" de novo não pode jogar o convidado
para o fim da fila.

### Jogo: a presença mora no jogo, não no jogador (amador)

Fase A feita em 24/09/2026, aprovada pelo Guilherme. **`Player.present` não
existe mais.** Quem vem sai das confirmações do Jogo aberto
(`useJogoStore`, `timecerto:jogos:v1`; regras puras em `lib/jogo.ts`), e
`usePresentes()` devolve quem joga: mensalista confirmado sempre, convidado
confirmado se tem vaga. Sorteio, partida direta e a aba Jogo leem dali;
`drawTeams` recebe a lista pronta. Duas fontes para a mesma coisa é como o app
volta a divergir de si mesmo.

- **Um jogo `aberto` por vez**; abrir outro encerra o anterior.
- **`Confirmacao.seq` é a ordem de chegada** e decide a fila. Nasce quando a
  pessoa passa a confirmada; confirmar de novo não muda; sair e voltar vai
  para o fim. Sem ele a fila vira ordem de cadastro, que não é justo.
- **Migração do `present`** (`migrarPresent`): na primeira carga depois de
  todos os stores hidratarem (`MigracaoPresent` em `App.tsx`), sem jogo aberto
  e com presentes, nasce o Jogo de hoje com uma confirmação por presente,
  **sem limite de vagas** — um limite inventado mandaria para a fila quem
  estava na lista. Jogo e marca gravam juntos; o `present` só sai depois. Se
  cair no meio, ou roda inteira de novo, ou não roda mais.
- **Adoção** (`JogoNuvem`): ao ler a nuvem, um evento aberto vira o Jogo do
  aparelho — ou se liga ao Jogo migrado —, e as respostas dos links entram
  como confirmações (`importarDoLink`). É o que impede a lista da semana de
  sumir na atualização. Jogo criado no aparelho e não publicado não adota:
  ganha "Publicar nos links", que troca o evento.
- **Vale a resposta mais recente** entre o toque do organizador e o link.
- `Jogo.listaFechada` é só ESPELHO de `events.list_closed`, para o botão de
  sortear saber o que dizer sem carregar o Supabase.

**Fase B, pendente:** os toques do organizador ainda não sobem para a nuvem —
quem ele confirma na lista aparece no link como "sem resposta". Adicionar
jogador no Elenco não confirma mais ninguém; o "Adicionar avulso" do Jogo
confirma.

Pagamento (mensalidade, avulso) fica para a etapa do financeiro.

### Lista fechada e times no link (amador)

Feito em 23/09/2026, migração 008. **Fechar a lista não é encerrar o jogo.**
`events.closed` tira o jogo do link — é o que "Abrir outro jogo" faz com o
anterior. `events.list_closed` só para de aceitar resposta: o jogo continua no
link, com quem confirmou e depois com os times. Antes existia só o `closed`, e
o botão "Fechar confirmações" fazia o jogo sumir das duas telas — não havia
onde mostrar time nenhum. O botão saiu.

A lista **fecha antes do sorteio**, no mesmo botão. Aberta, uma resposta que
chegasse depois mudaria quem tem vaga, e os times no link deixariam de bater
com a lista que o próprio link mostra. Sem sinal, o app avisa e deixa sortear
assim mesmo — sorteio é local. **Reabrir a lista tira os times do link**: time
velho no link é pior que nenhum.

`events.teams` guarda **só ids da nuvem** (`PublishedTeams` em `lib/cloud.ts`).
O nome sai da lista que `guest_group` já devolve, com apelido; o nível nunca
sai do aparelho. Publicar é explícito, no resultado: publicar sozinho
mostraria cada "Refazer" no link. O sorteio só sabe de qual jogo é quando sai
do cartão Próximo jogo (`DrawResult.eventId`, que chega pelo estado da navegação) — um
sorteio feito pela lista de jogadores não tem botão de publicar.

Com a lista fechada e sem times, o link se atualiza a cada 20 s até eles
chegarem.

### Roteiro do Amador

O foco atual é o **modo amador**; o profissional espera. Ordem combinada:

1. Mensalistas e convidados — **feito**
2. Do convite ao sorteio: fechar a lista, sortear só quem tem vaga, times no link — **feito**
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
