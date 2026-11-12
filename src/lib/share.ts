import type { DrawResult } from '@/types';
import { SPORTS } from '@/lib/sports';
import { skillOf } from '@/lib/draw';
import { nomeDeExibicao } from '@/lib/nome';

export function formatResultText(result: DrawResult, opts?: { showStars?: boolean }): string {
  const sport = SPORTS[result.sport];
  const showStars = opts?.showStars ?? false;
  const date = new Date(result.createdAt).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  });

  const lines: string[] = [];
  lines.push(`${sport.emoji} *TIMES SORTEADOS* — ${sport.name} (${date})`);
  lines.push('');

  result.teams.forEach((team) => {
    lines.push(`*${team.name.toUpperCase()}*`);
    team.players.forEach((p, i) => {
      const stars = showStars ? ` ${'⭐'.repeat(skillOf(p, result.sport))}` : '';
      lines.push(`${i + 1}. ${nomeDeExibicao(p)}${stars}`);
    });
    lines.push('');
  });

  if (result.bench.length > 0) {
    lines.push('*RESERVAS*');
    result.bench.forEach((p, i) => lines.push(`${i + 1}. ${nomeDeExibicao(p)}`));
    lines.push('');
  }

  lines.push('_Sorteado com TimeCerto_ ⚡');
  return lines.join('\n');
}

export function shareOnWhatsApp(text: string) {
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener');
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function nativeShare(text: string): Promise<boolean> {
  if (!navigator.share) return false;
  try {
    await navigator.share({ title: 'Times sorteados — TimeCerto', text });
    return true;
  } catch {
    return false;
  }
}

/**
 * Mensagem para o GRUPO do WhatsApp (pedido do Guilherme em 12/11/2026: "já
 * ser enviado direto no grupo sem precisar procurar").
 *
 * O link wa.me não aponta para grupo, e postar sozinho no grupo só com robô
 * (risco de banir o número) ou a API oficial de grupos (só grupos criados
 * pela empresa, conta verificada, pago). O que dá sem custo: no celular, a
 * folha de compartilhar do sistema, que mostra as conversas recentes do
 * WhatsApp — o grupo da pelada aparece no topo e vai com um toque. Sem a
 * folha (computador), cai no wa.me de sempre.
 */
export async function compartilharNoGrupo(text: string): Promise<void> {
  const celular = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (celular && typeof navigator.share === 'function') {
    try {
      await navigator.share({ text });
      return;
    } catch (e) {
      // Fechou a folha sem escolher: não abre mais nada
      if (e instanceof DOMException && e.name === 'AbortError') return;
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}
