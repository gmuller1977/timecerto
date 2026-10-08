import { usePlano } from '@/store/usePlano';
import type { Player } from '@/types';

/**
 * As cores das posições do vôlei (pedido do Guilherme em 08/10/2026): uma
 * por posição, na quadra, na escalação e nas listas do profissional. A cor
 * nunca vai sozinha — a sigla (LEV, OPO…) vai junto, para quem não distingue
 * bem as cores.
 *
 * As padrão vêm daqui; o time pode trocar em Ajustes, e a troca é UMA para o
 * time inteiro (groups.cores_posicoes, migração 039).
 */
export type PosicaoComCor = 'levantador' | 'oposto' | 'ponteiro' | 'central' | 'libero';

export const POSICOES_COM_COR: { id: PosicaoComCor; nome: string; sigla: string }[] = [
  { id: 'levantador', nome: 'Levantador', sigla: 'LEV' },
  { id: 'oposto', nome: 'Oposto', sigla: 'OPO' },
  { id: 'ponteiro', nome: 'Ponteiro', sigla: 'PON' },
  { id: 'central', nome: 'Central', sigla: 'CEN' },
  { id: 'libero', nome: 'Líbero', sigla: 'LIB' },
];

export const CORES_PADRAO: Record<PosicaoComCor, string> = {
  levantador: '#EF9F27',
  oposto: '#7F77DD',
  ponteiro: '#378ADD',
  central: '#1D9E75',
  libero: '#D85A30',
};

/** As que dá para escolher em Ajustes: legíveis sobre o fundo escuro do app */
export const PALETA_DE_POSICOES = [
  '#EF9F27',
  '#E24B4A',
  '#D4537E',
  '#7F77DD',
  '#378ADD',
  '#1D9E75',
  '#639922',
  '#D85A30',
] as const;

/** As cores do time ativo: as escolhidas em Ajustes, por cima das padrão */
export function useCoresDasPosicoes(): Record<PosicaoComCor, string> {
  const doTime = usePlano((s) => s.grupo?.coresPosicoes);
  return { ...CORES_PADRAO, ...(doTime ?? {}) };
}

/**
 * A posição que dá a cor ao atleta: o líbero e o levantador escolhidos para a
 * partida (08/10/2026), ou a posição principal do cadastro.
 */
export function posicaoDaCor(p: Player | undefined, liberoId?: string, levantadorId?: string): PosicaoComCor | null {
  if (!p) return null;
  if (liberoId && p.id === liberoId) return 'libero';
  if (levantadorId && p.id === levantadorId) return 'levantador';
  const pos = p.positions.volei;
  return POSICOES_COM_COR.some((x) => x.id === pos) ? (pos as PosicaoComCor) : null;
}

/** Como o atleta aparece na quadra: o apelido, ou o primeiro nome */
export const nomeCurto = (p: { name: string; nickname?: string } | undefined) =>
  p ? p.nickname?.trim() || p.name.split(' ')[0] : '?';

export const siglaDa = (pos: PosicaoComCor | null) => POSICOES_COM_COR.find((x) => x.id === pos)?.sigla ?? '';
