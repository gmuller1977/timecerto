import { momentoDaPromocao, type Promocao } from '@/lib/vagas';
import { inicioDo } from '@/lib/jogo';
import type { Jogo } from '@/types';

/**
 * Inscrição em duas fases (docs/telas-amador.md, migração 028): o que as telas
 * dizem sobre a promoção. A regra de quem tem vaga mora em lib/vagas.ts.
 */

/** O padrão do grupo (Ajustes). Sem `dias`, o grupo não usa a promoção */
export interface PromocaoDoGrupo {
  dias: number | null;
  /** "HH:MM" */
  hora: string | null;
  preferenciaPermanente: boolean;
}

export const usaPromocao = (p: PromocaoDoGrupo | null | undefined): p is PromocaoDoGrupo & { dias: number } =>
  p?.dias != null;

/**
 * Quando um jogo de `data` (AAAA-MM-DD) promove, pelo padrão do grupo: `dias`
 * antes, na `hora`, no fuso do aparelho. ISO.
 */
export function promoverEmPadrao(data: string, p: PromocaoDoGrupo & { dias: number }): string {
  const [a, m, d] = data.split('-').map(Number);
  const [hh, mm] = (p.hora ?? '20:00').split(':').map(Number);
  return new Date(a, m - 1, d - p.dias, hh, mm).toISOString();
}

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** "quinta às 20h" (ou "quinta às 20h30") */
export function quandoPromove(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  return `${DIAS[d.getDay()]} às ${h}h${m ? String(m).padStart(2, '0') : ''}`;
}

/** "quinta-feira (08/10) às 6h" (ou "às 6h30") — a data por extenso, para o link */
export function diaDaPromocao(iso: string): string {
  const d = new Date(iso);
  const semana = d.toLocaleDateString('pt-BR', { weekday: 'long' });
  const dm = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  const m = d.getMinutes();
  return `${semana} (${dm}) às ${d.getHours()}h${m ? String(m).padStart(2, '0') : ''}`;
}

export type Fase =
  | { tipo: 'sem' } // o jogo não usa a promoção
  | { tipo: 'mensalistas'; quando: string } // só mensalista tem vaga, até `quando`
  | { tipo: 'aberto'; preferenciaPermanente: boolean };

export function faseDoJogo(p: Promocao, agora: Date = new Date()): Fase {
  if (!p.promoverEm) return { tipo: 'sem' };
  return momentoDaPromocao(p, agora) === null
    ? { tipo: 'mensalistas', quando: quandoPromove(p.promoverEm) }
    : { tipo: 'aberto', preferenciaPermanente: Boolean(p.preferenciaPermanente) };
}

/**
 * A fase como as telas do ADMINISTRADOR a mostram: só enquanto o dia recebe
 * inscrições. Com a lista fechada, o dia encerrado ou já na hora do jogo, não
 * há mais o que avisar — relatado pelo Guilherme em 05/10/2026: o dia 04,
 * fechado, sorteado e jogado, seguia dizendo "Aberto para todos".
 */
export function faseNaTela(jogo: Jogo, agora: Date = new Date()): Fase {
  if (jogo.status !== 'aberto' || jogo.listaFechada || inicioDo(jogo) <= agora.getTime()) return { tipo: 'sem' };
  return faseDoJogo(jogo, agora);
}

/** A linha curta da fase, para o cartão e o cabeçalho do jogo */
export function textoDaFase(f: Fase): string | null {
  if (f.tipo === 'mensalistas') return `Mensalistas confirmando · convidados entram ${f.quando}`;
  if (f.tipo === 'aberto') return 'Aberto para todos';
  return null;
}
