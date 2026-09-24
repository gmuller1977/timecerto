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

**`InvitePage` tem 30 KB** e virou um segundo centro acidental — convites,
aprovações pendentes, links. Não cresceu por decisão: cresceu porque não havia
outro lugar para pôr essas coisas.

**Não existe endereço para configuração nem financeiro.** Regra de vaga, valor
da mensalidade, local, horário, conta: nada tem lugar. `Expense` e `Payment`
estão tipados em `types/index.ts` desde o início, sem uma linha de tela.

## A barra de abas

Quatro abas fixas no rodapé, sem estatísticas. Cada uma é uma raiz de
navegação própria: entrar numa aba nunca joga o usuário para fora de onde ele
estava nas outras.

| Aba | Ícone | O que responde |
| --- | --- | --- |
| Jogo | `Volleyball` | Quem vem hoje e o que vai acontecer agora |
| Elenco | `Users` | Quem é do grupo |
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

Responde "quem vem hoje e o que acontece agora". É a tela mais usada do app e a
única que precisa funcionar com o celular numa mão, na beira da quadra.

**A separação que resolve a bagunça:** confirmar presença deixa de morar na
lista de cadastro. Aqui a linha do jogador tem nome, um selo de mensalista ou
convidado, e um toque. Sem estrela, sem seletor de posição, sem lixeira. Quem
quiser mudar nível ou função vai ao Elenco — e quase nunca quer, no minuto
antes do jogo.

### Blocos, de cima para baixo

1. **Partida em andamento**, quando existe. Faixa verde com o placar atual,
   leva ao placar. Some quando não há jogo.
2. **Cabeçalho do dia** — data, local e horário vindos de Ajustes. Tocável
   para mudar só nesta data.
3. **Contador de vagas** — `12 confirmados · 2 vagas · 3 na fila`. É a leitura
   de `lib/vagas.ts` em uma linha.
4. **Lista de confirmação**, em três grupos: confirmados, fila de convidados,
   ausentes. Toque alterna presença; arrastar não faz nada (gesto perigoso em
   tela de pressa).
5. **Botão de ação fixo** — `Sortear (12)` como primário e `Partida direta`
   como secundário, como hoje.
6. **Últimas partidas** — três linhas, só placar e data, com "ver todas". Não é
   estatística; é memória curta de quem quer saber quanto deu semana passada.

### Decisões

**O seletor de esporte sai daqui.** Vira uma configuração do grupo em Ajustes.
Um grupo de pelada joga um esporte; trocar futebol por vôlei toda semana não é
o caso real, e o seletor no topo custa espaço em toda abertura.

**Adicionar avulso continua aqui**, como botão discreto no fim da lista: chega
alguém de última hora e ninguém quer sair da tela para cadastrar. Ele cria um
convidado com o mínimo — só nome — e o resto se completa depois no Elenco.

## Aba Elenco

Responde "quem é do grupo". Tela de manutenção, usada sentado, sem pressa — o
oposto da aba Jogo. Aqui cabe formulário, campo longo e confirmação.

### Duas listas, não uma

**Mensalistas** e **base de convidados** são cadastros com naturezas
diferentes e merecem seções separadas, com contagem própria em cada cabeçalho.

O mensalista tem vínculo: paga fixo, tem vaga garantida quando confirma, e o
grupo conta com ele. O convidado é um conhecido que joga quando sobra vaga — e
a base existe justamente para não redigitar o nome dele toda semana.

A distinção já é a régua de duas coisas: `lib/vagas.ts` decide quem entra, e o
Financeiro decide quem cobra de que jeito. Mover alguém de convidado para
mensalista é uma ação de uma linha na ficha, e deve ficar visível — é o momento
em que o grupo ganha um membro.

### Blocos

1. **Busca**, acima de tudo, a partir de ~10 pessoas.
2. **Pendentes de aprovação**, quando houver. Bloco no topo, em âmbar, com
   aprovar e recusar na própria linha. Vem da `InvitePage`, que deixa de
   existir como tela.
3. **Mensalistas** — lista com nome, apelido, função e nível.
4. **Base de convidados** — mesma linha, selo diferente.
5. **Botão Convidar** no cabeçalho, que gera e compartilha o link. É uma ação,
   não uma tela.

### A ficha do jogador

Toque na linha abre uma folha com tudo: nome, apelido, telefone, nascimento,
nível, função, tipo e observações. Hoje isso está espalhado entre a linha da
lista e a `PlayerSheet`; consolidar numa folha só tira os seletores de dentro
da lista, que é metade da poluição visual da tela atual.

Telefone e nascimento continuam visíveis apenas para o administrador, como já
estão marcados nos tipos.

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
| `PlayersPage` | Divide em duas | Presença → Jogo; cadastro → Elenco |
| `InvitePage` (30 KB) | Dissolve | Pendentes → Elenco; link → botão |
| `LoginPage` | Ajustes › Conta | Rota `/entrar` continua, para links |
| `DrawPage` | Jogo, com padrões de Ajustes | Vira um toque na maioria das vezes |
| `ResultPage` | Jogo | Sem mudança |
| `QuickMatchPage` | Jogo | Sem mudança |
| `ScoreboardPage` | Jogo, sem barra de abas | Tela de foco total |
| `MatchSummaryPage` | Jogo | Chegada natural do placar |
| `HistoryPage` | Jogo › ver todas | Não vira aba |
| `PlayerProfilePage` | Elenco | Some do modo amador se não houver scout |
| `GuestGroupPage` e irmãs | Fora das abas | São páginas públicas de link |
| — | **Financeiro** | Aba nova |
| — | **Ajustes** | Aba nova |

### O caso das páginas de convidado

`/c/:code`, `/r/:code` e `/a/:token` são abertas por quem não tem conta, vindo
do WhatsApp. Elas não mostram barra de abas nem menu — quem chega ali tem uma
tarefa só e não é dono de nada. Continuam como estão, fora da estrutura.

## Ordem de implementação

Cinco etapas. Cada uma deixa o app funcionando — nenhuma depende da seguinte
para fazer sentido.

**1. A barra de abas, com as telas de hoje.** Criar
`components/ui/TabBar.tsx` e um layout com `<Outlet>`. As abas apontam para o
que já existe: Jogo → `PlayersPage`, Elenco → `PlayersPage`, Financeiro e
Ajustes → placeholders. Nada quebra, e a navegação nova já pode ser sentida.
Esconder a barra em `/placar` e `/sortear`.

**2. Quebrar a `PlayersPage` em duas.** `TodayPage` fica com presença, vagas e
os botões de ação; `RosterPage` fica com cadastro, mensalistas e base de
convidados. Nenhuma funcionalidade nova — só separar. Esta etapa é a que
resolve a queixa original.

**3. Dissolver a `InvitePage`.** Pendentes vão para o topo do Elenco; gerar
link vira botão. É a etapa com maior risco de regressão, porque os links do
WhatsApp dependem dela — conferir os quatro fluxos de convidado antes de
fechar.

**4. Ajustes.** Grupo, vagas, valores, sorteio, conta, modo. Muitos dos valores
já existem em `useAppStore`; aqui eles ganham tela e passam a ser editáveis.
Tirar o seletor de esporte da aba Jogo só nesta etapa, quando já houver onde
configurá-lo.

**5. Financeiro.** Store novo, telas novas, e a ligação com `lib/vagas.ts` no
fechamento do jogo. É a maior das cinco e a única que cria domínio novo — por
isso vem por último, com a navegação já estável embaixo dela.

### Para o Claude Code

Uma etapa por sessão. As duas primeiras são reorganização pura e devem sair sem
nenhum comportamento novo — se aparecer funcionalidade nova na etapa 1 ou 2,
alguma coisa saiu do trilho.

Rodar a revisão do projeto ao fim de cada etapa. Prestar atenção especial à
hidratação: a barra de abas monta antes do `localStorage` terminar de ser lido,
e decidir qual aba mostrar antes disso repete o bug que já custou a perda de
partida em andamento.
