---
name: timecerto-review
description: Checklist de revisão antes de dar qualquer alteração do TimeCerto por pronta. Use ao terminar uma feature, antes de commitar, ou quando o usuário pedir revisão.
---

# Revisão antes de fechar

Nada é dado por pronto sem passar por aqui. A ordem importa: o que quebra mais
vem primeiro.

## 1. Compila

```bash
npm run build
```

`tsc -b` roda junto. Erro de tipo não passa. Se aparecer aviso de variável não
usada, remova de verdade em vez de silenciar.

## 2. A lógica está certa

Se mexeu em sorteio, estatística ou regra de set, escreva um script avulso e
rode de fato. Não confie na leitura.

```bash
npx tsx --tsconfig tsconfig.app.json ./_teste.ts
```

Confira **invariantes**, não só se roda:

- Sorteio: levantadores por time batem com o sistema? A diferença entre times
  nunca passa de 1? Todos os presentes foram alocados ou foram para o banco?
  Dois sorteios seguidos dão composições diferentes?
- Estatística: soma dos pontos bate com o placar? Mérito + erro do adversário
  = total? Saldo negativo aparece com sinal correto?

Foi esse tipo de conferência que pegou a concentração de levantadores. Uma
leitura do código não teria pego.

## 3. A tela funciona no caminho real

Playwright contra `npm run preview`, viewport **390x844**, clicando o fluxo
inteiro como usuário. Screenshot no fim.

Escute sempre:

```js
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error') console.log(m.text()); });
```

Os dois bugs de navegação do projeto só apareceram assim. Um deles perdia a
partida em andamento ao reabrir o app.

Confira também: rolagem horizontal (`documentElement.scrollWidth` ===
`clientWidth`), e que nada fica escondido atrás da barra fixa inferior.

## 4. Persistência e hidratação

Se a alteração lê algo do store e redireciona quando não acha:

- Espera `useHydrated()` antes de decidir?
- Recarregar a página no meio do fluxo mantém o estado?
- Com uma partida ao vivo em andamento, fechar e reabrir volta para ela?

## 5. Domínio

- O scout continua aceitando "Só marcar o ponto"?
- A ordem dos fundamentos continua por frequência de jogo?
- Time sem elenco continua sem a pergunta de autoria?
- Dinheiro continua em centavos inteiros?

## 6. Visual

- Cores vêm dos tokens `brand-*`/`ink-*`, não de cores cruas do Tailwind?
- Gráfico novo usa `SERIES`/`STATUS` de `volleyStats.ts`?
- Toda série tem rótulo direto — nada depende só de cor?
- Estatística nova tem a frase que explica o que ela significa?
- Alvos de toque grandes o suficiente para uso em pé?

## 7. Limpeza

- Scripts de teste avulsos apagados (`_teste.ts`, `_*.mjs`)?
- `console.log` de depuração removido?
- Dependência instalada só para testar foi desinstalada?
- Nenhuma chave, token ou `.env` no commit?

## 8. Commit

Mensagem em português, imperativo, dizendo **o que mudou e por quê**. Bug
corrigido entra com a explicação do sintoma — é o que salva a próxima sessão.
