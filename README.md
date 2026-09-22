# TimeCerto ⚡

Sorteio de times equilibrados para **futebol, vôlei e basquete** — PWA mobile-first, em português, com compartilhamento direto no WhatsApp.

> Nome de trabalho. A decisão final da marca ainda está em aberto.

## Status — Fase 1 (MVP offline)

| Feature | Status |
|---|---|
| Cadastro de jogadores com nível (1–5 ⭐) e posição | ✅ |
| Multi-esporte com posições próprias de cada modalidade | ✅ |
| Controle de presença (quem joga hoje) | ✅ |
| Sorteio balanceado por nível + posição + goleiro/levantador | ✅ |
| Resultado com média de cada time e indicador de equilíbrio | ✅ |
| Compartilhar no WhatsApp / copiar texto | ✅ |
| Persistência local (funciona sem conta e sem internet) | ✅ |
| PWA instalável (manifest + ícones) | ✅ |
| Service worker / offline completo | ⬜ |
| Contas, grupos compartilhados, financeiro (Supabase) | ⬜ Fase 2 |

## Rodando

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + build de produção
npm run preview
```

## Stack

- **React 19 + TypeScript + Vite**
- **Tailwind CSS v4** (via `@tailwindcss/vite`)
- **zustand** com `persist` → estado em `localStorage`
- **react-router-dom** · **lucide-react**
- **Supabase** (preparado, inativo na fase 1)

## Arquitetura

```
src/
  lib/
    sports.ts     Configuração de cada esporte (posições, tamanho de time)
    draw.ts       Algoritmo de sorteio balanceado
    share.ts      Formatação do texto e integração WhatsApp
    utils.ts      Helpers
    supabase.ts   Cliente (fase 2)
  store/
    useAppStore.ts  Estado global persistido
  pages/
    PlayersPage.tsx  Cadastro e presença
    DrawPage.tsx     Configuração do sorteio
    ResultPage.tsx   Times sorteados e compartilhamento
  components/
    ui/ players/ sports/
  types/index.ts
```

### Como o sorteio funciona

1. **Goleiros primeiro** — jogadores marcados como goleiro (futebol) ou levantador (vôlei) são distribuídos um por time, do mais forte ao mais fraco.
2. **Serpentina embaralhada** — o restante é ordenado por nível (5 → 1), com embaralhamento dentro de cada nível para que dois sorteios seguidos não deem o mesmo time.
3. **Alocação gulosa** — cada jogador entra no time com a menor soma de estrelas que ainda tem vaga, com preferência pelos times que ainda precisam da posição dele.
4. **Melhor de N** — o processo roda 40 vezes e devolve o resultado com a menor diferença entre o time mais forte e o mais fraco. Sai cedo se encontrar equilíbrio perfeito.

O resultado é sempre justo, mas nunca idêntico — o fator sorte continua existindo.

## Próximos passos

- Service worker para funcionamento offline real
- Histórico de peladas e estatísticas por jogador
- Confirmação de presença por link compartilhado
- Controle financeiro do grupo (mensalidade, rateio, PIX)
- Scout: perfil de jogador e busca por região/posição/nível
