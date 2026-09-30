# TimeCerto — Visão Amadora: estrutura de telas

Especificação de reorganização da navegação do modo amador.
Documento vivo: https://claude.ai/code/artifact/0ce567c0-26ca-4c7c-8f67-573a263f9e2b

## O problema

O app tem 16 rotas e nenhum modelo de navegação. Cada tela é alcançada por um
botão específico de outra tela específica, e se volta por uma seta. Isso é uma
corrente, não uma estrutura — funcionava com cinco telas, não funciona com
dezesseis.

**`/amador` faz cinco trabalhos.** Escolher esporte, cadastrar jogador,
classificar mensalista ou convidado, marcar presença e lançar o jogo. O
cadastro de uma pessoa acontece uma vez; a presença acontece toda semana. Hoje
a tarefa frequente carrega o peso da tarefa rara.

**`InvitePage` tem 32 KB** e virou um segundo centro acidental — convites,
aprovações pendentes, links, e até o cadastro de mensalista. Não cresceu por
decisão: cresceu porque não havia outro lugar para pôr essas coisas.

**Não existe endereço para configuração nem financeiro.** Regra de vaga, valor
da mensalidade, local, horário, conta: nada tem lugar. `Expense` e `Payment`
estão tipados em `types/index.ts` desde o início, sem uma linha de tela.

## A barra de abas

Quatro abas fixas no rodapé, sem estatísticas. Cada uma é uma raiz de
navegação própria: entrar numa aba nunca joga o usuário para fora de onde ele
estava nas outras.

| Aba | Ícone | O que responde |
| --- | --- | --- |
| Jogo | `Volleyball` | O jogo de hoje: criar, convidar, sortear, pontuar |
| Atletas | `Users` | Quem é do grupo, e quem entra nele |
| Financeiro | `Wallet` | Quem pagou e quanto entrou |
| Ajustes | `Settings` | Como o grupo funciona |

**Quando a barra some.** Na tela do placar e na de sorteio. São telas de foco
total, usadas em pé — a barra rouba altura e convida a sair no meio de um
jogo. Saem por "Encerrar" ou pela seta, nunca por aba.

**Estado preservado por aba.** Trocar de aba e voltar mantém rolagem, busca e
filtro. Sem isso o organizador perde a posição na lista toda vez que confere um
valor no Financeiro.

**A aba Jogo é a inicial.** Abrir o app cai direto nela, não no menu de modos.
O menu Amador/Profissional passa a viver em Ajustes — trocar de modo é raro e
não merece bloquear a abertura toda vez.

## Aba Jogo

Responde "o jogo de hoje". É a tela mais usada do app e a única que precisa
funcionar com o celular numa mão, na beira da quadra.

O jogo tem ciclo: **criar → convidar → confirmar → sortear → pontuar**. A aba
acompanha esse ciclo e mostra só o que importa no estágio em que o jogo está.

### O jogo é uma entidade, não uma lista

Hoje presença é um booleano no jogador (`Player.present`) — existe um estado de
presença, nunca um jogo. Isso não sustenta o que a aba precisa fazer: convidar
para uma data, receber confirmações, e começar de novo na semana seguinte sem
apagar o histórico.

Precisa existir um **`Jogo`** com data, local, horário, vagas e a lista de
confirmações. `Player.present` deixa de ser a verdade e vira uma consequência
do jogo aberto. É a mudança de domínio desta etapa — sem ela, convite de jogo
não tem a que se referir.

### Os dois tipos de convite

São coisas diferentes e moram em abas diferentes:

| | Convite de jogo | Convite de cadastro |
| --- | --- | --- |
| Aba | **Jogo** | **Atletas** |
| Diz | "Tem jogo quinta, você vem?" | "Entra para o grupo" |
| Para quem | Quem já está cadastrado | Quem ainda não existe no app |
| Resultado | Uma confirmação | Um cadastro novo |
| Validade | Aquele jogo | Permanente |

Hoje os dois estão misturados na `InvitePage`, e o cadastro de mensalista
acabou morando dentro de "convites" — que por sua vez é alcançado pelo Elenco.
É essa cadeia que precisa ser desfeita.

### Blocos, de cima para baixo

1. **Partida em andamento**, quando existe. Faixa verde com o placar atual,
   leva ao placar.
2. **O jogo** — data, local, horário e vagas. Sem jogo aberto, este bloco é um
   botão "Criar jogo" que já vem preenchido com os padrões de Ajustes.
3. **Convidar** — botão que dispara o convite do jogo no WhatsApp. Dois
   destinos: mensalistas (todos de uma vez) e convidados (escolhidos da base).
4. **Confirmações** — `12 confirmados · 2 vagas · 3 na fila`, e a lista em três
   grupos: confirmados, fila de convidados, sem resposta. Toque alterna a
   confirmação manualmente, para quem respondeu por fora.
5. **Botão de ação fixo** — `Sortear (12)` como primário e `Partida direta`
   como secundário.
6. **Últimas partidas** — três linhas, só placar e data, com "ver todas".

### Decisões

**A linha do jogador aqui é mínima:** nome, selo de mensalista ou convidado, e
um toque. Sem estrela, sem seletor de posição, sem lixeira. Quem quiser mudar
nível ou função vai em Atletas — e quase ninguém quer, no minuto antes do jogo.

**O seletor de esporte sai daqui.** Vira configuração do grupo em Ajustes.

**Adicionar avulso continua aqui**, como botão discreto no fim da lista: chega
alguém de última hora e ninguém quer sair da tela. Cria um convidado só com o
nome; o resto se completa depois em Atletas.

## Aba Atletas

Responde "quem é do grupo, e quem entra nele". Tela de manutenção, usada
sentado, sem pressa — o oposto da aba Jogo. Aqui cabe formulário, campo longo e
confirmação.

O nome é **Atletas**, não Elenco: elenco é quem foi escalado, e isso é conceito
do modo profissional. Aqui são as pessoas do grupo, escaladas ou não.

### Desfazer a cadeia atual

Hoje o cadastro de mensalista mora dentro da `InvitePage`, que por sua vez é
alcançada pelo Elenco. Cadastrar alguém exige atravessar uma tela de convites —
duas ideias diferentes empilhadas porque o link precisava de um lugar.

O certo é o inverso: o cadastro é a tela, e o convite é um botão dentro dela.

### Duas listas, não uma

**Mensalistas** e **base de convidados** são cadastros de naturezas diferentes
e merecem seções separadas, com contagem própria.

O mensalista tem vínculo: paga fixo, tem vaga garantida quando confirma, e o
grupo conta com ele. O convidado é um conhecido que joga quando sobra vaga — e
a base existe para não redigitar o nome dele toda semana.

A distinção já é a régua de duas coisas: `lib/vagas.ts` decide quem entra no
jogo, e o Financeiro decide quem cobra de que jeito. Promover um convidado a
mensalista é uma ação de uma linha na ficha, e deve ficar visível — é o momento
em que o grupo ganha um membro.

### Blocos

1. **Busca**, acima de tudo, a partir de ~10 pessoas.
2. **Pendentes de aprovação**, quando houver. Bloco no topo, em âmbar, com
   aprovar e recusar na própria linha. Vem da `InvitePage`.
3. **Mensalistas** — lista com nome, apelido, função e nível. Cabeçalho da
   seção tem **Convidar mensalista**, que gera o link de cadastro.
4. **Convidados** — mesma linha, selo diferente. Cabeçalho tem **Adicionar
   convidado**, cadastro direto, sem link.
5. **Botão de cadastro manual** fixo no rodapé, para quem prefere digitar a
   ficha inteira.

### Por que o convite de cadastro fica aqui

Ele produz um cadastro, e cadastro é o assunto desta aba. O convite de jogo
produz uma confirmação e fica na aba Jogo. A regra para decidir qualquer dúvida
futura: **o convite mora onde mora a coisa que ele cria.**

### A ficha do jogador

Toque na linha abre uma folha com tudo: nome, apelido, telefone, nascimento,
nível, função, tipo e observações. Hoje isso está espalhado entre a linha da
lista e a `PlayerSheet`; consolidar numa folha só tira os seletores de dentro
da lista, que é metade da poluição visual da tela atual.

Telefone e nascimento continuam visíveis apenas para o administrador, como já
está marcado nos tipos.

## Aba Financeiro

Responde "quem pagou e quanto entrou". Não existe hoje. `Expense` e `Payment`
já estão em `types/index.ts` e nunca foram usados.

### As duas cobranças

A distinção mensalista/convidado já construída é exatamente a régua da
cobrança, e ela gera dois fluxos diferentes:

- **Mensalista** paga valor fixo por mês, independente de quantas vezes jogou.
  A cobrança nasce do calendário.
- **Convidado** paga por jogo em que entrou. A cobrança nasce da presença —
  `lib/vagas.ts` já sabe quem entrou de fato, e é esse dado que vira dívida.

Essa ligação é o coração da aba: hoje `vagas.ts` decide quem joga e ninguém
registra que aquilo gerou uma cobrança. Fechar o jogo deve oferecer, numa
linha, lançar a diária dos convidados que entraram.

### Blocos

1. **Resumo do mês** — três números: recebido, a receber, saldo depois das
   despesas. O saldo é o único em destaque.
2. **Quem deve** — lista ordenada por valor, com o botão de cobrar que abre o
   WhatsApp com a mensagem pronta. É o bloco mais usado e deve vir antes de
   qualquer gráfico.
3. **Despesas do período** — quadra, bola, água. Cada uma com valor, data e
   quem pagou.
4. **Lançar** — botão fixo que abre folha com duas opções: registrar pagamento
   recebido ou registrar despesa.

### Regras

**Valores sempre em centavos inteiros.** `amountCents` já está assim nos tipos.
Nunca ponto flutuante para dinheiro, em nenhuma operação intermediária —
divisão de rateio arredonda no fim, e a sobra de centavos vai para quem pagou a
despesa.

**Pagamento nunca é apagado, é estornado.** Histórico de dinheiro é onde
confiança se ganha ou se perde num grupo. Um lançamento errado vira um
contra-lançamento visível, não um sumiço.

**Sem integração de pagamento nesta etapa.** O app registra que entrou; quem
recebe é o organizador, pelo PIX dele. Chave PIX fica em Ajustes e entra na
mensagem de cobrança. Processar pagamento de verdade traz obrigação
regulatória e não é problema desta versão.

## Aba Ajustes

Responde "como o grupo funciona". Recebe tudo que hoje está espalhado ou
simplesmente não tem lugar.

### Seções

**O grupo** — nome, esporte (vindo do seletor que sai da aba Jogo), local, dia
e horário padrão.

**Vagas** — total de vagas por jogo, e se convidado entra em fila ou por ordem
de confirmação. São os parâmetros que `lib/vagas.ts` hoje decide sozinho, sem
ninguém poder mudar.

**Valores** — mensalidade, diária de convidado, chave PIX. Alimentam a aba
Financeiro e a mensagem de cobrança.

**Sorteio** — os padrões que hoje são perguntados toda vez na `DrawPage`:
jogadores por time, equilibrar por nível, equilibrar por posição. A `DrawPage`
continua existindo para ajuste pontual, mas abre já preenchida e vira um botão
só na maioria das semanas.

**Conta** — entrar, sair, sincronização. Absorve a `LoginPage`.

**Modo** — trocar entre Amador e Profissional. Absorve a `HomePage` como menu.

### A decisão embutida

Tirar o menu de modos da abertura muda o caráter do app: ele deixa de perguntar
quem você é toda vez e passa a lembrar. Quem usa o app é organizador de um
grupo, não alguém que alterna entre dois papéis — e um menu obrigatório antes
de cada uso é um pedágio pago por todos para servir a um caso raro.

## Mapa de migração

Nenhuma tela é jogada fora. Quase tudo muda de endereço.

| Tela atual | Vai para | Observação |
| --- | --- | --- |
| `HomePage` | Ajustes › Modo | Deixa de ser a abertura |
| `PlayersPage` | Divide em duas | Confirmação → Jogo; cadastro → Atletas |
| `InvitePage` (32 KB) | Divide em três | Cadastro e link → Atletas; convite de jogo → Jogo; pendentes → Atletas |
| `LoginPage` | Ajustes › Conta | Rota `/entrar` continua, para links |
| `DrawPage` | Jogo, com padrões de Ajustes | Vira um toque na maioria das vezes |
| `ResultPage` | Jogo | Sem mudança |
| `QuickMatchPage` | Jogo | Sem mudança |
| `ScoreboardPage` | Jogo, sem barra de abas | Tela de foco total |
| `MatchSummaryPage` | Jogo | Chegada natural do placar |
| `HistoryPage` | Jogo › ver todas | Não vira aba |
| `PlayerProfilePage` | Atletas | Some do amador se não houver scout |
| `GuestGroupPage` e irmãs | Fora das abas | São páginas públicas de link |
| — | **Financeiro** | Aba nova |
| — | **Ajustes** | Aba nova |
| — | **`Jogo` no domínio** | Entidade nova: data, vagas, confirmações |

### O caso das páginas de convidado

`/c/:code`, `/r/:code` e `/a/:token` são abertas por quem não tem conta, vindo
do WhatsApp. Elas não mostram barra de abas nem menu — quem chega ali tem uma
tarefa só e não é dono de nada. Continuam como estão, fora da estrutura.

## O grupo é o contexto

O app assume um grupo só, e guardava o modo na pessoa (`useAppStore.mode`).
As duas coisas estão erradas, e a segunda é a que trava a primeira.

### O modo pertence ao grupo

"Pelada de quinta" é um grupo amador. "Sub-17 feminino" é um time
profissional. O tipo é característica do grupo, não de quem o administra — a
mesma pessoa pode ter uma pelada e treinar um time.

Com o modo na pessoa, trocar de contexto exige dois passos: mudar o modo e
depois achar o grupo. Com o modo no grupo, é um passo: escolher o grupo. O app
se configura sozinho, com as abas e o vocabulário daquele tipo.

### O fluxo

Entrar → escolher o grupo → o app se configura. Sem tela de modo no meio.

### A escolha não pode ser pedágio

A maioria dos administradores tem um grupo. Obrigar essa maioria a atravessar
uma tela de seleção em toda abertura, para servir a minoria que tem dois, é
cobrar de todos pelo caso raro — o mesmo erro do menu de modos.

- O app abre no último grupo usado.
- O nome do grupo no cabeçalho é o seletor. Toca e troca.
- A tela de escolha aparece só no primeiro login, ou quando não há grupo
  lembrado.

### Como isso encaixa no plano

O plano já é do grupo (`lib/plano.ts`): preço acompanhando valor, e o técnico
com quatro times pagando quatro vezes. Com o tipo também no grupo, os dois
andam juntos — e abre a porta para faixas diferentes por tipo.

## Multi-grupo: o que fazer agora e o que adiar

**O banco já aguenta.** `group_members` é muitos-para-muitos e não há trava
obrigando um grupo por pessoa. Multi-grupo é problema exclusivamente do app.

**O que trava do lado do app.** Todo store persistido assume "o grupo":
`useAppStore` guarda um elenco, `useJogoStore` um conjunto de jogos, o
financeiro um caixa. Nenhum deles sabe a qual grupo pertence. Fazer multi-grupo
é particionar cada store por grupo e migrar o que existe sem perder nada — um
refactor transversal.

**Por que adiar.** Ninguém tem dois grupos ainda; colide com o trabalho em
andamento; e o banco já suporta, então nada está sendo fechado.

**Quando entrar.** O gatilho é o primeiro usuário real com dois grupos — não
uma data: um `grupoAtivo` lembrado entre sessões, cada store com a chave do
localStorage incluindo o id, o conteúdo atual virando o do único grupo
existente, seletor no cabeçalho.

## Ordem de implementação

Cada etapa deixa o app funcionando — nenhuma depende da seguinte para fazer
sentido. O financeiro e o plano vieram fora de ordem.

**1. A barra de abas, com as telas de hoje.** ✓ Feita. `TabBar`, `TabLayout` e
`EmBrevePage`, com a barra escondida em `/placar` e `/sortear` e respeitando a
hidratação.

**2. Quebrar a `PlayersPage` em duas.** ✓ Feita. `JogoPage` fica com
confirmação e os botões de ação; `AtletasPage` fica com cadastro, mensalistas e
convidados. Aba Elenco renomeada para **Atletas**.

**3. A entidade `Jogo`.** ✓ Feita. Data, local, horário, vagas e confirmações.
`Player.present` migrado para confirmação do jogo aberto.

**4. Separar os dois convites.** ✓ Feita. Convite de cadastro em Atletas
(Convidar, com mensalista ou convidado); convite de jogo na aba Jogo.

**5. Ajustes.** Em parte. Já tem nome do grupo, plano, financeiro,
administradores, avisos, sair da conta e trocar de modo. Faltam local, horário
e vagas padrão, os padrões do sorteio, e levar o seletor de esporte da aba Jogo
para cá.

**6. Financeiro.** ✓ Feita (migrações 017 a 020). Mensalidade, diária, avulsa,
Pix, cobrança no WhatsApp, recebimentos, despesas, caixa.

**7. O tipo do grupo.** ✓ Feita em 30/09/2026. A coluna já existia:
`groups.mode` ('amador' | 'profissional') sempre guardou o tipo, e cada grupo
nasceu com o certo — criar `tipo` seria duplicá-la, então não houve migração.
`/` é a `AberturaPage`: abre direto no tipo lembrado (`useAppStore.mode`, que
agora é a lembrança do tipo do último grupo, e responde sem rede); sem
lembrança, pergunta à nuvem (`meusGrupos`) e, com grupos de um tipo só, é esse.
A `HomePage` saiu da abertura e virou `/modo`, que aparece só sem grupo, com os
dois tipos, ou por Ajustes › Trocar de modo — e mostra o grupo de cada tipo.
O seletor no cabeçalho fica para a etapa 8, porque só serve a quem tem dois.

**8. Multi-grupo.** ✓ Feita em 30/09/2026, a pedido do Guilherme. Um grupo
ativo lembrado no aparelho (`lib/grupoAtivo.ts`), e cada store persistido
numa chave do grupo (`timecerto:v1@<id>`); trocar de grupo é trocar de chave
(`store/trocarGrupo.ts`). O conteúdo de antes — com os dois modos misturados
— é ADOTADO por tipo: o primeiro grupo amador leva o que era da pelada, o
primeiro profissional leva o elenco e as partidas do profissional, e o segundo
grupo de um tipo nasce vazio. O nome do grupo no alto de Jogo e do elenco
profissional é o seletor; `/modo` virou a lista dos grupos, com "Criar novo
grupo". Perder o acesso ao grupo ativo apaga só a cópia dele.

## O profissional com as mesmas abas

Pedido do Guilherme em 30/09/2026: Jogo, Atletas, Financeiro e Ajustes também
no profissional. Os dois cadastros de atleta são diferentes (a pelada tem
nível, posição e mensalista/convidado; o time tem categoria, naipe, altura e
peso), então em três fases:

**Fase 1. A casca e o plano.** ✓ Feita em 30/09/2026. A barra de abas e a faixa
do grupo no profissional. Jogo (`ProJogoPage`): "Novo jogo" pergunta
**Amistoso** ou **Campeonato** e segue para a escalação, com a partida em
andamento e as últimas. Atletas: o elenco do time (`/profissional`, com
Convidar). Financeiro e Ajustes são os da pelada, olhando o grupo ativo
(`findActiveGroup`). Migração 022: o profissional entra no plano, com 30
dias de teste; no grátis, o elenco vai até 20.

**Fase 2. Um cadastro só.** O elenco do time vira o mesmo cadastro da pelada,
com os campos do profissional a mais, migrando sem perder ninguém. Destrava a
aba Jogo igual à da pelada (agenda, confirmação pelo link, vagas) e a
mensalidade por atleta.

**Fase 3. Da confirmação para a escalação.** "Escalar" no jogo do time abre a
escalação já com os confirmados, no lugar do sorteio.

### Para o Claude Code

Uma etapa por sessão. Rodar a revisão do projeto ao fim de cada etapa. Prestar
atenção especial à hidratação: a barra de abas monta antes do localStorage
terminar de ser lido, e decidir qual aba mostrar antes disso repete o bug que
já custou a perda de partida em andamento.
