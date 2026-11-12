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
