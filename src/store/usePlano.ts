import { create } from 'zustand';
import type { CloudGroup } from '@/lib/cloud';
import { situacaoDoPlano, type SituacaoDoPlano } from '@/lib/plano';

/**
 * O plano do grupo da conta (migração 021), como a sincronização viu na última
 * rodada. Não fica guardado no aparelho: vem da nuvem a cada abertura, e até
 * lá `grupo` é null — e ninguém trava nada por não saber.
 */
interface PlanoState {
  grupo: CloudGroup | null;
  souDono: boolean;
  situacao: SituacaoDoPlano | null;
  definir: (grupo: CloudGroup | null, meuId: string | null) => void;
}

export const usePlano = create<PlanoState>()((set) => ({
  grupo: null,
  souDono: false,
  situacao: null,
  definir: (grupo, meuId) =>
    set({
      grupo,
      souDono: Boolean(grupo && meuId && grupo.ownerId === meuId),
      situacao: grupo ? situacaoDoPlano(grupo.plano) : null,
    }),
}));

/** Liberado? Enquanto não se sabe, sim: quem decide de verdade é o banco */
export const usePremium = () => usePlano((s) => s.situacao?.premium ?? true);
