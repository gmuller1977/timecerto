---
name: timecerto-ui
description: Padrões de interface do TimeCerto — tokens, componentes, layout mobile e gráficos. Use ao criar ou alterar qualquer tela, componente ou visualização do app.
---

# Interface do TimeCerto

App de quadra: usado em pé, com o celular na mão, olhando para o jogo e não
para a tela. Isso decide quase tudo abaixo.

## Tokens

Definidos em `src/index.css` sob `@theme`. Tailwind v4, sem arquivo de config.

- `brand-50…900` — verde da marca. Ação principal é `bg-brand-500` com texto
  `text-ink-950`.
- `ink-50…950` — escala de cinza. Fundo da página `ink-950`, cartão `ink-900`,
  borda `ink-800`, texto secundário `ink-400`, texto apagado `ink-500`.

Tema escuro único. Não existe modo claro. Nunca use `bg-gray-800` e afins —
sempre os tokens.

## Layout

```tsx
<div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-32">
```

Container padrão de página: centralizado, `max-w-lg`, `px-4`. O `pb-32` abre
espaço para a barra fixa inferior.

Barra de ação fixa:

```tsx
<div className="safe-bottom fixed inset-x-0 bottom-0 border-t border-ink-800 bg-ink-950/95 px-4 py-3 backdrop-blur">
  <div className="mx-auto flex max-w-lg gap-2">…</div>
</div>
```

`safe-top` e `safe-bottom` existem em `index.css` para o notch do iOS.
`no-scrollbar` para faixas roláveis horizontais.

Referência de largura: **390px**. Sempre confira que não há rolagem horizontal
— linha com botão de largura fixa ao lado de conteúdo flexível é a causa
comum. Use `flex-wrap`, `min-w-0` no que encolhe e `shrink-0` no que não pode.

## Componentes

`Button` (`components/ui/Button.tsx`) — variantes `primary`, `secondary`,
`ghost`, `danger`; tamanhos `sm`, `md`, `lg`. `lg` é altura 56px, o padrão para
ação principal no celular.

`StarRating` — nível 1 a 5, aceita `readOnly`.

Cartão: `rounded-2xl border border-ink-800 bg-ink-900 p-4`.
Pílula/seletor: `rounded-xl border`, ativo vira
`border-brand-500 bg-brand-500/15 text-brand-300`.

Folha inferior (bottom sheet): fundo `bg-black/70` clicável para fechar,
painel `rounded-t-3xl border-t border-ink-700 bg-ink-900`, alça
`h-1 w-10 rounded-full bg-ink-700` centralizada no topo.

Toque: `active:scale-[0.98]` em tudo que é clicável. Alvo mínimo confortável
44px; na tela do placar, o alvo é metade da tela inteira.

## Texto

Português do Brasil, direto, sem jargão de produto. "Sortear", não "Gerar
composição de equipes".

Toda estatística vem acompanhada da leitura do que significa. Número sozinho
não muda comportamento — a frase explicativa é parte do recurso, não enfeite.
Veja `readGiftedShare` em `lib/volleyStats.ts` como referência de tom.

Estado vazio sempre diz o que fazer em seguida, não só que está vazio.

## Gráficos

Use `components/charts/Bars.tsx`: `StackedBar` (composição), `RankedBars`
(magnitude entre categorias), `DivergingBars` (polaridade, como saldo).

Cores saem de `SERIES` e `STATUS` em `lib/volleyStats.ts`. Essa paleta foi
validada para contraste e daltonismo contra o fundo escuro — **não escolha
cor no olho e não acrescente matiz nova** sem revalidar.

Regras que a paleta assume:

- Identidade nunca por cor sozinha: toda série tem rótulo direto com o valor.
- Sinal de saldo vem do `+`/`−` no número, não só da cor.
- 2px de respiro entre segmentos de barra empilhada.
- Pontas de dado arredondadas em 4px, apenas no lado do valor.
- Texto em tokens `ink-*`, nunca na cor da série.

Barra empilhada com mais de 4 fatias vira ruído — agrupe em "Outros".

## Ícones

`lucide-react`, tamanho 16–19 em linha de texto, 22 em cabeçalho de página.
