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
 * Mensagem para o GRUPO do WhatsApp (pedido do Guilherme em 12/11/2026:
 * "clicar e já abrir o grupo, onde o usuário clica" — nada é postado sozinho).
 *
 * O wa.me não aponta para grupo. Com o link do grupo salvo em Ajustes
 * (migração 042), a lista vai para a área de transferência e o grupo abre;
 * a pessoa cola e envia. Sem o link: no celular, a folha de compartilhar do
 * sistema (o grupo recente aparece no topo); no computador, o wa.me.
 *
 * Tudo síncrono até o window.open: depois de um await o navegador barra a
 * janela. Devolve 'copiado' quando abriu o grupo, para a tela avisar "cole".
 */
export function compartilharNoGrupo(text: string, linkDoGrupo?: string | null): 'copiado' | 'compartilhado' {
  if (linkDoGrupo) {
    copiarJa(text);
    window.open(linkDoGrupo, '_blank', 'noopener');
    return 'copiado';
  }
  const celular = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (celular && typeof navigator.share === 'function') {
    navigator.share({ text }).catch((e) => {
      // Fechou a folha sem escolher: não abre mais nada
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
      }
    });
    return 'compartilhado';
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  return 'compartilhado';
}

/** Copia ainda dentro do toque: o jeito antigo (síncrono) e, por cima, a API nova */
function copiarJa(text: string) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  } catch {
    /* segue para a API nova */
  }
  navigator.clipboard?.writeText(text).catch(() => {});
}

/** O aviso que aparece depois de abrir o grupo com a lista copiada */
export const AVISO_COLAR = 'Lista copiada. No grupo, toque e segure na caixa de mensagem, Colar e enviar.';
