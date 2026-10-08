import type { Match, VolleyAction } from '@/types';
import { ACTION_LABEL } from '@/lib/volley';
import { hasDetail, hasPlayerDetail, playerScouts, setsWonBy, teamScout } from '@/lib/volleyStats';
import { formatDate } from '@/lib/stats';

/**
 * O scout da partida em PDF (pedido do Guilherme em 08/10/2026), no lugar do
 * texto para o WhatsApp: um arquivo vai para o grupo do time, para o técnico,
 * e continua legível depois.
 *
 * O jsPDF é carregado só aqui, na hora de compartilhar — não pesa na abertura
 * do app. A fonte padrão do PDF não tem emoji, então nada de emoji no texto.
 */
export async function compartilharScoutEmPdf(match: Match, nomeDe: (id: string) => string) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 15;
  const R = 195;
  let y = 18;

  const [teamA, teamB] = match.teams;
  const texto = (s: string, x: number, size = 10, estilo: 'normal' | 'bold' = 'normal', cor = 30) => {
    doc.setFont('helvetica', estilo);
    doc.setFontSize(size);
    doc.setTextColor(cor);
    doc.text(s, x, y);
  };
  const direita = (s: string, x: number, size = 10, estilo: 'normal' | 'bold' = 'normal') => {
    doc.setFont('helvetica', estilo);
    doc.setFontSize(size);
    doc.setTextColor(30);
    doc.text(s, x, y, { align: 'right' });
  };
  const linha = () => {
    doc.setDrawColor(210);
    doc.line(L, y, R, y);
  };
  const pularSeNaoCouber = (mm: number) => {
    if (y + mm > 285) {
      doc.addPage();
      y = 18;
    }
  };

  // ── Cabeçalho e placar ──
  texto(match.mode === 'profissional' ? 'Resumo da partida' : 'Resumo do jogo', L, 16, 'bold');
  direita(formatDate(match.date), R, 10);
  y += 12;
  texto(`${teamA.name}  ${setsWonBy(match, teamA.id)}  x  ${setsWonBy(match, teamB.id)}  ${teamB.name}`, L, 14, 'bold');
  y += 7;
  texto(match.games.map((g, i) => `${i + 1}º set ${g.scoreA}-${g.scoreB}`).join('     '), L, 10, 'normal', 90);
  y += 8;
  linha();
  y += 8;

  if (!hasDetail(match)) {
    texto('Partida registrada só no placar — sem scout de fundamentos.', L, 10, 'normal', 90);
  } else {
    // ── Por time ──
    const fundamentos: VolleyAction[] = ['ataque', 'bloqueio', 'saque'];
    const erros: VolleyAction[] = ['ataque', 'bloqueio', 'saque', 'recepcao', 'levantamento', 'defesa', 'falta', 'indefinido'];
    const sa = teamScout(match, teamA.id);
    const sb = teamScout(match, teamB.id);
    const cA = 140;
    const cB = 185;

    texto('Por time', L, 12, 'bold');
    y += 7;
    texto('', L);
    direita(teamA.name.slice(0, 18), cA, 9, 'bold');
    direita(teamB.name.slice(0, 18), cB, 9, 'bold');
    y += 2;
    linha();
    y += 5;
    const lin = (rotulo: string, a: number | string, b: number | string, negrito = false) => {
      texto(rotulo, L, 10, negrito ? 'bold' : 'normal');
      direita(String(a), cA, 10, negrito ? 'bold' : 'normal');
      direita(String(b), cB, 10, negrito ? 'bold' : 'normal');
      y += 6;
    };
    lin('Pontos', sa.points, sb.points, true);
    for (const f of fundamentos) {
      lin(`   ${f === 'saque' ? 'Ace' : ACTION_LABEL[f]}`, sa.earnedByAction[f] ?? 0, sb.earnedByAction[f] ?? 0);
    }
    lin('   Erro do adversário', sa.gifted, sb.gifted);
    lin('Erros cometidos', sa.errors, sb.errors, true);
    for (const f of erros) {
      const a = sa.errorsByAction[f] ?? 0;
      const b = sb.errorsByAction[f] ?? 0;
      if (a || b) lin(`   ${ACTION_LABEL[f]}`, a, b);
    }
    lin('Eficiência', `${Math.round(sa.efficiency * 100)}%`, `${Math.round(sb.efficiency * 100)}%`, true);
    y += 4;

    // ── Por atleta ──
    if (hasPlayerDetail(match)) {
      const atletas = [...playerScouts([match]).values()].sort((a, b) => b.balance - a.balance || b.points - a.points);
      pularSeNaoCouber(30);
      texto('Por atleta', L, 12, 'bold');
      y += 7;
      const cols = [
        { t: 'Ataque', x: 95 },
        { t: 'Bloq.', x: 112 },
        { t: 'Ace', x: 127 },
        { t: 'Pontos', x: 146 },
        { t: 'Erros', x: 164 },
        { t: 'Saldo', x: 185 },
      ];
      texto('Atleta', L, 9, 'bold');
      for (const c of cols) direita(c.t, c.x, 9, 'bold');
      y += 2;
      linha();
      y += 5;
      for (const s of atletas) {
        pularSeNaoCouber(8);
        const n = match.camisas?.[s.playerId];
        texto(`${n != null ? `${n} · ` : ''}${nomeDe(s.playerId)}`.slice(0, 40), L, 10);
        const v = [
          s.pointsByAction.ataque ?? 0,
          s.pointsByAction.bloqueio ?? 0,
          s.pointsByAction.saque ?? 0,
          s.points,
          s.errors,
        ];
        v.forEach((x, i) => direita(String(x), cols[i].x, 10));
        direita(s.balance > 0 ? `+${s.balance}` : String(s.balance), cols[5].x, 10, 'bold');
        y += 6;
      }
      y += 2;
      texto('Saldo = pontos feitos menos erros cometidos.', L, 8, 'normal', 120);
    }
  }

  // Rodapé
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.text('Scout feito no TimeCerto', L, 290);

  const data = new Date(match.date).toISOString().slice(0, 10);
  const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  const nome = `scout-${slug(teamA.name)}-x-${slug(teamB.name)}-${data}.pdf`;
  const arquivo = new File([doc.output('blob')], nome, { type: 'application/pdf' });

  // No celular, a folha de compartilhar (WhatsApp, e-mail…); senão, baixa
  if (navigator.canShare?.({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo], title: 'Scout da partida' });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  doc.save(nome);
}
