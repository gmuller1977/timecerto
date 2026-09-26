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

O app roda offline, em `localStorage`. **Desde 25/09/2026 ele abre no login**, como o
FairSet (pedido do Guilherme): as telas do organizador exigem conta
(`ExigeConta` em `App.tsx`). A guarda só olha se há sessão SALVA no aparelho,
sem rede — quem já entrou usa no ginásio sem sinal. Os links do WhatsApp
(`/c`, `/v`, `/r`, `/a`, `/admin`) ficam de fora: mensalista, convidado e
atleta não têm conta. Depois do login a pessoa volta para onde estava
(`?volta=`); o login obrigatório não tem seta de voltar.
O Supabase (projeto `whhvojozemwmnhnpyqpz`) entra para **login do
organizador, convites e a base única** — ver "Convites" e "Base única" abaixo.

**Base única, em fases** (aprovada pelo Guilherme em 24/09/2026 — "uma base de
dados única, em qualquer plataforma"): 1. atletas — **feito** (migração 010);
2. jogos, sorteios e partidas — **feito** (migração 013; a estatística sai das
partidas, então veio junto); 3. configurações. Até lá, as configurações de um
aparelho não aparecem no outro. A partida **ao vivo** fica no aparelho que
marca o placar e sobe quando termina.

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
  nome **e a posição** (obrigatória na tela, migração 011) e entra na fila.
  Nome de convidado que já existe = a mesma pessoa voltando, e só ganha
  posição se não tinha; nome de mensalista é recusado.

**Só mensalista leva convidado** — decidido pelo Guilherme, travado nas duas
pontas: na tela, "Levar alguém de fora" só existe no link dos mensalistas para
quem se identificou como mensalista (convidado nem aparece em "Quem é você?");
no banco, `guest_add_player` recusa quem não é mensalista. Quem leva também
informa a posição do levado. No banco a posição é opcional, de propósito: quem
estava com a versão antiga aberta na troca não fica travado.
- `/#/r/CÓDIGO` — link de **cadastro de mensalistas** (`groups.register_code`):
  nome, **apelido**, nascimento, telefone, posição e nível. Fica **pendente**
  (`players.pending`) até o administrador aprovar no topo de Atletas; pendente
  não aparece em link nenhum nem entra no sorteio. O nível é sugestão — o
  sorteio usa o que o administrador deixar.

  **Nome que já existe passa como pendente** (migração 009, 24/09/2026). Antes
  o link recusava, e quem batia nisso era quem já é do grupo indo completar o
  próprio cadastro. Na aprovação, `candidatosParaJuntar` (`lib/juntar.ts`)
  sugere "Juntar com fulano" — mesmo telefone, mesmo nome sem acento/caixa,
  mesmo apelido, ou o nome inteiro de um contido no outro; nunca só o
  primeiro nome. Juntar leva nascimento, telefone e apelido; nível, posição e
  tipo continuam os do administrador. **A junção nunca é automática**: se o
  banco juntasse pelo nome, qualquer um com o link escreveria telefone e
  nascimento no cadastro de outra pessoa. Só o pedido repetido (já há um
  pendente com o nome) continua barrado.

  **Recusar e juntar desativam o pedido na nuvem ANTES** de tirar do aparelho
  (`aposentarJogador`). `syncAmador` começa trazendo quem entrou pelo link e
  não está no aparelho — sem isso o pedido recusado voltava na mesma hora, e
  foi o que acontecia até 24/09/2026.
- `/#/a/TOKEN` — link pessoal do atleta: completa nascimento, altura e peso.
  Menor de idade exige o aceite do responsável (LGPD).

**Telefone e nascimento nunca saem pelas funções `guest_*`.** Só o
administrador vê, na ficha do jogador (`PlayerSheet`).

**Apelido** (`Player.nickname`, opcional): na pelada é o nome de verdade, então
aparece no lugar do nome em listas, links, times, WhatsApp e placar —
`nomeDeExibicao` em `lib/nome.ts`; nos links, `guest_group` faz a mesma conta.
As telas de partida recebem o apelido pronto de `useRoster`. O nome completo
fica na ficha.

### Mais de um administrador (amador)

Pedido do Guilherme em 24/09/2026, migração 012. O dono convida em **Ajustes ›
Administradores** (`components/cloud/Administradores.tsx`); o link
`/#/admin/TOKEN` (`AdminInvitePage`) pede o Google e, ao aceitar, a pessoa vira
`organizador` em `group_members` — e `can_manage_group` já deixava o
organizador gravar atletas, jogos, respostas e times.

- **Uso único e 48 h** (`admin_invites`): o link dá poder de administrador; se
  vazar no WhatsApp, não transforma mais ninguém.
- **Só o dono convida e remove administradores** (`members_owner_manage`);
  qualquer um sai sozinho, menos o dono (`members_self_leave`). Isto fechou
  uma brecha: a política antiga deixava um organizador remover o dono.
- `findMyGroup` acha o grupo próprio e, sem ele, o grupo em que a pessoa é
  organizadora. **Um grupo por conta e por modo**: quem tem grupo próprio e
  aceita administrar outro continua vendo o próprio.
- Ao aceitar, a tela já sincroniza os atletas: a sincronização automática
  procurou o grupo ao abrir o app, antes do aceite.
- O administrador vê o que a base única já cobre: atletas, jogos, respostas,
  sorteios e partidas encerradas.

### Fluxo do administrador (amador)

Definido pelo Guilherme em 23/09/2026. A tela Convites deixou de existir no
amador em 24/09/2026 (etapa 3 de `docs/telas-amador.md`); o fluxo é o mesmo,
em dois lugares:

- **Atletas** (a aba se chamava Elenco; a rota continua `/elenco`): 1. **Convidar** no cabeçalho manda o link de cadastro
  (`ConvidarSheet`); 2. os pedidos aparecem no topo, em âmbar, com aprovar e
  recusar na linha; tocar num jogador abre a ficha.
- **Jogo** (`JogosPage`, a lista; `JogoPage`, a página de um jogo; a parte dos
  links em `components/cloud/LinksDoJogo.tsx`): 3. cria o jogo: data,
  horário, **local** e vagas (`components/jogo/FormJogo.tsx`); 4. **Convidar
  mensalistas** e **Convidar convidados**, na página do próximo jogo; 5. as
  respostas entram na lista e atualizam sozinhas (sincronização a cada 30 s);
  6. **Fechar a lista e sortear** (no rodapé) leva ao sorteio só quem tem vaga.
- 7. no resultado, **Publicar os times no link** — todo mundo vê pelos dois links.

`/convites` ficou só para o profissional; no amador leva ao Jogo. Conta (sair)
fica em Ajustes › Conta.

O convite abre o WhatsApp ANTES de sincronizar — depois de um `await` o
navegador pode barrar a janela.

O Supabase só carrega para quem tem sessão salva (`lib/sessao.ts`). Com o login
obrigatório, isso vale para os links e para a própria tela de login.

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

### Fila de espera com confirmação (amador)

Feito em 25/09/2026, migração 015, com o desenho aprovado pelo Guilherme.
**Com a lista ABERTA nada muda**: o convidado que passa das vagas fica na
fila e entra sozinho quando abre vaga. **Com a lista FECHADA**, a fila vira
espera e precisa de confirmação:

- **Fechar a lista** converte quem estava na fila em `espera`, na ordem.
  Quem chega pelo link depois — mensalista ou convidado — também entra na
  espera. O link continua aceitando "não vou" de quem tinha vaga.
- **Alguém com vaga sai** (link ou administrador): o BANCO chama o primeiro
  da espera (`chamado`, com `chamado_em` e `vaga_de` = quem saiu). A regra
  mora em gatilhos (`fila_ao_responder`, `fila_ao_fechar`, `chamar_proximo`),
  para valer igual pelos dois caminhos. A vaga do chamado fica reservada.
- **Mensalista vem antes de convidado na espera**, depois por `espera_desde`.
- **O chamado responde no link**: sim entra, não chama o próximo.
- **O administrador vê "Vaga aberta"** em `LinksDoJogo` (`ChamadasDaEspera`):
  "Chamar no WhatsApp" abre a conversa com a mensagem pronta — direto no
  número se o cadastro tem telefone — e o link leva `?eu=ID`, que já abre como
  aquela pessoa. **Não há prazo automático**: "Passar a vez" grava `pulado` e o
  banco chama o próximo. O pulado que responder depois volta para o fim.
- **Depois do sorteio, quem decide é o administrador** (`AjusteDosTimes` na
  página do jogo): "Ajustar os times" põe quem entrou no lugar de quem saiu,
  no mesmo time (`encaixarNoSorteio` em `lib/draw.ts`, pela `vagaDe`), e
  republica no link se os times estavam publicados; ou "Sortear de novo".
- Reabrir a lista devolve todos da espera à fila de sempre.
- `answered_at` continua sendo a hora da última mudança — é por ela que o
  app sabe o que é mais novo. A ordem da espera é outra coluna,
  `espera_desde`, justamente para não brigar com isso.

O SQL foi provado num Postgres de verdade (PGlite) antes de ir para o banco:
fechar, entrar na espera, prioridade do mensalista, sair, recusar, pular,
aceitar, voltar depois de pulado, vaga sobrando e reabrir.

**Fase 2 — avisos no celular: feita**, ver a seção seguinte.

### Avisos no celular (web push)

Feito em 25/09/2026, migração 016, com o escopo decidido pelo Guilherme. Quem
ativa **"Me avise pelo celular"** no link (`AvisoDoAtleta`) recebe: vaga
aberta para ele, jogo novo marcado, o próprio time quando é publicado ou muda,
e o aviso manual do administrador. O administrador que ativa em **Ajustes ›
Avisos no celular** (`AvisosDoAdmin`) recebe: alguém saiu da lista fechada, o
chamado aceitou ou recusou, e vaga aberta sem ninguém na espera.

- **Caixa de saída**: todo aviso vira uma linha em `avisos`, gravada pelos
  gatilhos ou por `avisar_inscritos`. Só entra quem tem para onde entregar.
  Um **Database Webhook** chama a Edge Function
  [`enviar-aviso`](supabase/functions/enviar-aviso/index.ts) a cada linha nova.
- **A função marca "saiu" antes de entregar**: chamá-la de fora ou duas vezes
  não inventa nem repete aviso. Inscrição que o serviço de push dá por morta
  (404/410) é apagada.
- **As tabelas não têm política**: só as funções mexem. O administrador sabe
  QUAIS atletas têm aviso (`inscritos_com_aviso`), nunca as chaves.
- **Só endereços dos serviços de push** (Google, Apple, Mozilla, Microsoft),
  no banco e de novo na função: sem isso, alguém cadastraria um endereço
  qualquer e faria o servidor mandar requisições para ele.
- **Jogo novo** é anunciado uma vez (`events.anunciado_em`): ao criar ou
  mudar um jogo, e pela sincronização do administrador (`anunciar_jogo`) —
  que pega o jogo que virou o próximo só porque o anterior passou da janela.
  Os jogos que existiam ao rodar a migração contam como anunciados.
- **Times**: só quem mudou de lugar é avisado; republicar depois de encaixar
  um substituto não avisa o time inteiro.
- **Service worker** (`public/sw.js`) só recebe aviso: não guarda cache nem
  intercepta requisição, para não prender o app numa versão velha.
- **iPhone** só recebe com o site instalado na tela de início (regra da
  Apple, iOS 16.4+); o link mostra como. Quem abre pelo ícone cai no login, e
  o login oferece "Sou jogador: abrir a lista do meu grupo" com o link que o
  aparelho já usou. O painel do jogo mostra quem **não** tem aviso, para
  chamar pelo WhatsApp.
- Horários dos avisos em America/Sao_Paulo (`quando_do_jogo`).

**Configuração (uma vez)**: par de chaves com `npx web-push
generate-vapid-keys`; a **pública** em `VITE_VAPID_PUBLIC_KEY` (`.env` e
Vercel — é pública por natureza); a **privada** só em Edge Functions ›
Secrets, junto com `VAPID_PUBLIC_KEY` e `VAPID_SUBJECT` (mailto:). Sem a
chave pública no app, nada de avisos aparece.

**Não dá para testar no navegador do painel do Claude**: ele não registra
service worker. O fluxo das telas foi testado com o navegador simulado; a
entrega de verdade, só num celular.

### Jogo: a presença mora no jogo, não no jogador (amador)

Fase A feita em 24/09/2026, aprovada pelo Guilherme. **`Player.present` não
existe mais.** Quem vem sai das confirmações de cada Jogo
(`useJogoStore`, `timecerto:jogos:v1`; regras puras em `lib/jogo.ts`), e
`usePresentes(jogoId)` devolve quem joga: mensalista confirmado sempre,
convidado confirmado se tem vaga. Sorteio, partida direta e a página do jogo
leem dali; `drawTeams` recebe a lista pronta. Duas fontes para a mesma coisa é
como o app volta a divergir de si mesmo.

- **Vários jogos programados ao mesmo tempo** (pedido do Guilherme em
  24/09/2026): a aba Jogo lista todos, e tocar num abre a página dele, com
  Confirmados, Times, Partidas e Estatística. Encerrar e cancelar são à mão,
  na edição do jogo; o jogo sai de "Próximos" também 12 h depois do horário.
- **Os links mostram o PRÓXIMO jogo**: o mais cedo ainda aberto, a partir de
  12 h atrás (`proximoJogo` em `lib/jogo.ts`, a mesma regra de `guest_group`
  na migração 013). Os outros jogos esperam a vez: a página deles diz qual
  está nos links, e só o próximo oferece convite, lista fechada e publicar.
- **O esporte é do jogo** (migração 014, pedido do Guilherme em 25/09/2026).
  A aba Jogo não tem mais seletor de esporte no topo: ele é escolhido ao
  criar o jogo, aparece no cartão e é um dos filtros. Isto substitui o plano
  de `docs/telas-amador.md` de levar o esporte para Ajustes como configuração
  do grupo. **Abrir um jogo põe o app no esporte dele** (`setSport` em
  `JogoPage`), e é assim que sorteio, partida e níveis do elenco seguem o jogo
  sem cada tela saber de onde veio. Consequência aceita: Atletas mostra os
  níveis do esporte do último jogo aberto. Depois do sorteio o esporte não muda.
  Os links usam o esporte do jogo — posições e a posição do convidado.
- **Status do jogo é derivado, nunca guardado** (`statusDoJogo` em
  `lib/jogo.ts`): cancelado/encerrado pelo organizador; em jogo com partida ao
  vivo; o próximo recebe inscrições até a lista fechar; os outros programados
  são agendados; passou da janela de 12 h sem encerrar, "não encerrado". O
  mesmo selo (`SeloStatus`) no cartão, na página e no filtro.
- **Filtros da lista**: modalidade, dia e status. Filtrando, os anteriores
  aparecem abertos — recolhidos, esconderiam o resultado.
- **O sorteio e as partidas pertencem ao jogo**: `Jogo.sorteio` e
  `Match.jogoId`. O sorteio sai da página do jogo (`/sortear` com `jogoId` no
  estado) e o resultado abre em `/resultado?jogo=ID`; sem `?jogo`, vale o
  último sorteio local (`lastResult`), para a partida direta antiga.
- **`Confirmacao.seq` é a ordem de chegada** e decide a fila. Nasce quando a
  pessoa passa a confirmada; confirmar de novo não muda; sair e voltar vai
  para o fim. Sem ele a fila vira ordem de cadastro, que não é justo.
- **Migração do `present`** (`migrarPresent`): na primeira carga depois de
  todos os stores hidratarem (`MigracaoPresent` em `App.tsx`), sem jogo aberto
  e com presentes, nasce o Jogo de hoje com uma confirmação por presente,
  **sem limite de vagas** — um limite inventado mandaria para a fila quem
  estava na lista. Jogo e marca gravam juntos; o `present` só sai depois. Se
  cair no meio, ou roda inteira de novo, ou não roda mais.
- **Adoção** (`mesclarJogos` em `lib/cloud.ts`): ao ler a nuvem, o Jogo
  migrado do `present` que ainda não tem id da nuvem se liga ao evento aberto
  que já existe, em vez de criar outro. É o que impede a lista da semana de
  sumir na atualização. Todo jogo novo já nasce com o id da nuvem.
- **Vale a resposta mais recente** entre o toque do organizador e o link.
- `Jogo.listaFechada` é só ESPELHO de `events.list_closed`, para o botão de
  sortear saber o que dizer sem carregar o Supabase.

**Fase B, feita em 24/09/2026: os toques do organizador sobem para a nuvem.**
Antes, o link não via quem o administrador confirmava — e, pior, achava que
havia vaga onde não havia, e quem entrava pelo link furava a fila de espera.
A sincronização (`SincronizacaoNuvem`) envia em lote, 1,5 s depois do último
toque, as confirmações com `origem: 'organizador'` e `enviadoEm !== at`
(`pendentesDeEnvio`); `enviarRespostas` grava `vou`/`nao_vou` com
`answered_at` = hora do toque (é o que ordena a fila no link). **"Sem resposta"
é gravado como `sem_resposta`, não apagado** (migração 013): apagar a linha
não contava a um segundo aparelho que o organizador desmarcou alguém. Os links
leem `sem_resposta` como nulo. Sem sinal, a confirmação espera e vai depois —
o toque nunca espera a rede. As respostas da nuvem são lidas antes do envio,
para as do link entrarem primeiro. Resposta que veio do link nasce enviada.

As confirmações da migração do `present` têm hora no início dos tempos: o
`present` antigo não pode vencer, nem sobrescrever na nuvem, um "não vou" que
a pessoa deu de verdade pelo link.

Adicionar jogador em Atletas não confirma ninguém; o "Adicionar avulso" do
Jogo confirma.

### Tela de sorteio

Primeiro a quantidade de times; **jogadores por time saem da divisão**: vagas
do jogo ÷ times (14 vagas em 2 times = 7), ou confirmados ÷ times em jogo sem
limite. O organizador muda à mão, **de 1 a 10** — pedido do Guilherme em
24/09/2026 (zero não forma time). Trocar a quantidade de times refaz a conta.

Quando o sistema de jogo pede levantadores, **quem levanta se marca ali
mesmo** (`Levantadores` em `DrawPage.tsx`), convidado incluído — antes o aviso
mandava "para a tela anterior", que não edita posição. Grava a posição no
cadastro, então vale para os próximos sorteios.

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
mostraria cada "Refazer" no link. Só o sorteio do **próximo** jogo tem botão
de publicar — é o único que os links mostram.

O sorteio **completo** (com níveis, para "Refazer" e começar partida em outro
aparelho) viaja em `events.sorteio`, que só membros do grupo leem — os mesmos
que já leem `players`, com os níveis; o convidado dos links não passa por ali.
`events.teams` é a versão pública, e só muda ao publicar.

Com a lista fechada e sem times, o link se atualiza a cada 20 s até eles
chegarem.

### Roteiro do Amador

O foco atual é o **modo amador**; o profissional espera. Ordem combinada:

1. Mensalistas e convidados — **feito**
2. Do convite ao sorteio: fechar a lista, sortear só quem tem vaga, times no link — **feito**
3. Partidas na nuvem: histórico em outro aparelho — **feito** (migração 013); falta resultados e estatística no link
4. Financeiro: mensalidade, avulso, Pix, quem pagou
5. Acabamento: co-organizador, offline no ginásio (service worker), avisos

Todo acesso do convidado passa pelas funções `guest_*` do esquema, que
conferem código ou token. **Nenhuma tabela é aberta para `anon`** — não
crie política para `anon`; crie uma função `guest_*` nova.

### Base única — fase 1: atletas (amador)

Feita em 24/09/2026, migração 010. **A nuvem é a base comum do elenco amador
em todos os aparelhos da conta**; cada aparelho é uma cópia que funciona sem
sinal. `syncAmador` (`lib/cloud.ts`) envia o que ESTE aparelho editou e traz o
que os outros editaram. Quem dispara é `SincronizacaoNuvem` (em `App.tsx`,
carregada só com sessão salva): ao abrir, ao voltar ao app, quando a internet
volta, a cada 30 s e 1,5 s depois de qualquer edição.

- **Duas horas por jogador.** `updated_at` é a hora da EDIÇÃO e decide quem
  vence; `synced_at` é a hora de CHEGADA, carimbada pelo gatilho do banco, e é
  por ela que cada aparelho lê "o que mudou desde a última vez"
  (`leituraNuvem`). Separar as duas impede um relógio atrasado de perder
  mudanças.
- **Vale a edição mais recente, decidido no servidor** (`salvar_jogadores`):
  só sobrescreve se o `updated_at` que chega for maior. Depois de enviar, o
  aparelho **relê as linhas que mandou** — a recusa é silenciosa e não muda
  `synced_at`, e sem a releitura o aparelho ficava com a versão velha,
  reenviando para sempre. Aconteceu no teste; está coberto.
- **Nada é desativado por ausência.** O `upsertAndRetire` do amador saiu: ele
  deixava um segundo aparelho de elenco diferente apagar os links. Excluir vira
  marca (`deleted_at`) guardada em `excluidos` até subir; por isso recusar e
  juntar pedido funcionam sem sinal e o pedido não volta.
- **Inativo sem marca de exclusão** é resto do mecanismo antigo, às vezes
  errado: não apaga nada no aparelho, e quem ainda tem a pessoa a reenvia —
  ela volta aos links.
- **Primeira sincronização depois da atualização:** jogador sem hora de edição
  e já na nuvem segue a versão de lá (`LEGADO` = início dos tempos); o que
  nunca subiu é somado. Antes, o elenco inteiro é copiado para
  `timecerto:elenco-antes-da-nuvem`, para recuperação manual.
- Toda edição de jogador passa por `useAppStore` e carimba `updatedAt`. A
  mescla da nuvem usa `setState` direto, para não carimbar de novo.

O id da nuvem nasce no aparelho (`crypto.randomUUID`, em `remoteId`), então um
envio só resolve novos e existentes.

O **profissional** continua no modelo antigo (`syncPro`): o aparelho é a fonte
e a nuvem recebe uma cópia. Nascimento/altura/peso da nuvem vencem (quem
preencheu foi o atleta).

As telas que falam com o banco são carregadas sob demanda (`lazy` em
`App.tsx`): o cliente do Supabase não entra no pacote do placar.

### Base única — fase 2: jogos, sorteios e partidas (amador)

Feita em 25/09/2026, migração 013, com a lista de jogos. Mesmo desenho da fase
1 — `updated_at` decide, `synced_at` é a leitura incremental, o servidor
recusa a edição mais velha e o aparelho relê o que mandou. A ordem de uma
rodada importa: **atletas, jogos, partidas** (`SincronizacaoNuvem`), porque
respostas, sorteio e partida falam de jogadores pelo id da nuvem, e a partida
fala do jogo pelo id da nuvem.

- **Jogo = evento** (`salvar_jogos`). Sobem data, local, vagas, status e o
  sorteio; `list_closed` e `teams` NÃO passam por ali — são gravados na hora,
  por quem fecha a lista ou publica, e o aparelho só os espelha. `closed`
  acompanha o status, porque as funções dos links olham `closed`.
- **Partida encerrada sobe inteira em `matches.dados`** (`salvar_partidas`),
  com os ids de jogador trocados pelos da nuvem (`trocarJogadores`) e o jogo
  em `event_id`. As tabelas `games`/`rallies` continuam vazias: o link de
  resultados (`guest_matches`) ainda lê de lá, e é outra etapa.
- **Excluir partida vira lápide** (`useMatchStore.excluidas`), como o atleta.
- **Só o amador sobe.** Partida do profissional segue no aparelho.
- **Esporte do jogo recebido**: o evento não tem coluna de esporte; o jogo que
  chega de outro aparelho pega o do sorteio, ou o do aparelho. A Estatística
  usa o esporte das próprias partidas — no teste, um jogo recebido sem sorteio
  ficou com o esporte padrão e a tabela saiu vazia.
- Jogador que não está no elenco do aparelho sai do sorteio e da partida
  recebidos, em vez de virar um id solto.

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

Feito: login do organizador, grupo na nuvem, convites, presença, e jogos,
sorteios e partidas entre aparelhos (migração 013).
Falta: resultados no link (as partidas sobem em `matches.dados`, mas
`guest_matches` lê `games`/`rallies` e devolve vazio — o convidado ainda não vê
resultados), login por WhatsApp, financeiro do grupo, ranking.
O esquema está em `supabase/schema.sql` com RLS por grupo e papéis
(dono/organizador/jogador).

### Pendências anotadas (26/09/2026)

- **Testar os avisos no celular num aparelho de verdade.** A configuração
  foi toda feita em 25/09 (migração 016, segredos VAPID, Edge Function
  `enviar-aviso` — endereço automático `clever-resp…` —, webhook
  `avisar-celular` e `VITE_VAPID_PUBLIC_KEY` na Vercel, conferida no build
  publicado). Falta o teste ponta a ponta: um Android ativa "Me avise pelo
  celular" no link e o administrador manda "Avisar pelo celular". Se não
  chegar: `avisos.enviado_em` vazio = webhook; `resultado` com falhas = ver
  os logs da função.
- **Ideia do Guilherme, só para avaliar: avisos direto no WhatsApp**, em vez
  de (ou além de) notificação do navegador — um "agente" que manda as
  atualizações e talvez receba "vou / não vou" pela conversa. O caminho
  oficial é a WhatsApp Business Platform (Cloud API da Meta): número próprio
  do app, conta Business, mensagem iniciada pelo app só com modelo aprovado
  e opt-in de quem recebe, cobrança por mensagem conforme a categoria.
  Automação de conta pessoal (bibliotecas não oficiais) viola os termos do
  WhatsApp e arrisca banir o número — descartado. **Decidido em 26/09/2026:
  fica a notificação no celular**; o WhatsApp oficial só volta à mesa se, na
  prática, o "abriu vaga" ficar sem resposta com frequência.

O ponto mais delicado dessa fase: **o scout não pode parar por falta de
internet.** Ginásio tem sinal ruim. Qualquer sincronização precisa ser
otimista, com fila local e reconciliação depois — nunca bloquear o registro
de um ponto esperando rede.
