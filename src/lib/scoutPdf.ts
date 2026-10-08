import type { jsPDF as JsPDF } from 'jspdf';
import type { Match, Player, Rally, VolleyAction } from '@/types';
import { ERROR_ACTIONS } from '@/lib/volley';
import { allRallies, hasDetail, readGiftedShare, SERIES, setsWonBy, teamScout } from '@/lib/volleyStats';
import { getPositionLabel } from '@/lib/sports';
import { formatDate } from '@/lib/stats';

/**
 * O relatório do scout em PDF (pedido do Guilherme em 08/10/2026): do macro ao
 * micro — o jogo, cada set, os pontos e os erros por fundamento com quem fez,
 * e por fim cada atleta. Pizza em cada nível, para ler a proporção de relance.
 *
 * O jsPDF é carregado só aqui, na hora de compartilhar — não pesa na abertura
 * do app. A fonte padrão do PDF não tem emoji, então nada de emoji no texto.
 */

interface Fatia {
  label: string;
  value: number;
  color: string;
}

const PONTOS: { action: VolleyAction; label: string }[] = [
  { action: 'ataque', label: 'Ataque' },
  { action: 'bloqueio', label: 'Bloqueio' },
  { action: 'saque', label: 'Ace' },
];
// Os nomes que o scout mostra na hora de marcar o erro
const ERROS: { action: VolleyAction; label: string }[] = [
  ...ERROR_ACTIONS.map((e) => ({ action: e.action, label: e.label })),
  { action: 'indefinido', label: 'Não classificado' },
];
const COR_ERRO_ADV = '#94a3b8';

export async function compartilharScoutEmPdf(match: Match, jogadorDe: (id: string) => Player | undefined) {
  return entregar(await gerarRelatorioDoScout(match, jogadorDe), match);
}

/** Monta o relatório; separado do compartilhar para dar para gerar e conferir fora do app */
export async function gerarRelatorioDoScout(match: Match, jogadorDe: (id: string) => Player | undefined): Promise<JsPDF> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const r = new Relatorio(doc);
  const [teamA, teamB] = match.teams;
  const times = [teamA, teamB];

  const nome = (id: string) => {
    const p = jogadorDe(id);
    const n = match.camisas?.[id] ?? p?.numero;
    const curto = p ? p.nickname?.trim() || p.name : 'Jogador';
    return n != null ? `${n} · ${curto}` : curto;
  };

  // De onde vieram os pontos de um time, e os erros que ele cometeu
  const origem = (m: Match, teamId: string): Fatia[] => {
    const s = teamScout(m, teamId);
    return [
      ...PONTOS.map((p) => ({ label: p.label, value: s.earnedByAction[p.action] ?? 0, color: SERIES[p.action] })),
      { label: 'Erro do adversário', value: s.gifted, color: COR_ERRO_ADV },
    ];
  };
  const errosDe = (m: Match, teamId: string): Fatia[] => {
    const s = teamScout(m, teamId);
    return ERROS.map((e) => ({ label: e.label, value: s.errorsByAction[e.action] ?? 0, color: SERIES[e.action] }));
  };

  // ── 1. O jogo ──
  r.titulo(match.mode === 'profissional' ? 'Relatório da partida' : 'Relatório do jogo', formatDate(match.date));
  r.texto(`${teamA.name}  ${setsWonBy(match, teamA.id)}  x  ${setsWonBy(match, teamB.id)}  ${teamB.name}`, 15, 'bold');
  r.y += 6;
  r.texto(match.games.map((g, i) => `${i + 1}º set ${g.scoreA}-${g.scoreB}`).join('     '), 10, 'normal', 90);
  r.y += 4;

  if (!hasDetail(match)) {
    r.y += 6;
    r.texto('Partida registrada só no placar — sem scout de fundamentos para detalhar.', 10, 'normal', 90);
    return rodape(doc);
  }

  const sa = teamScout(match, teamA.id);
  const sb = teamScout(match, teamB.id);
  r.secao('1. O jogo');
  r.nota(readGiftedShare((sa.gifted + sb.gifted) / Math.max(1, sa.points + sb.points)));
  r.par(
    { titulo: `Pontos de ${teamA.name}`, fatias: origem(match, teamA.id) },
    { titulo: `Pontos de ${teamB.name}`, fatias: origem(match, teamB.id) },
  );
  r.par(
    { titulo: `Erros de ${teamA.name}`, fatias: errosDe(match, teamA.id) },
    { titulo: `Erros de ${teamB.name}`, fatias: errosDe(match, teamB.id) },
  );
  r.nota(
    `Eficiência (pontos de mérito sobre mérito + erros): ${teamA.name} ${Math.round(sa.efficiency * 100)}% · ${teamB.name} ${Math.round(sb.efficiency * 100)}%`,
  );

  // ── 2. Set a set ──
  r.novaPagina();
  r.secao('2. Set a set');
  match.games.forEach((g, i) => {
    if (!(g.rallies ?? []).length) return;
    const doSet: Match = { ...match, games: [g] };
    r.espaco(70);
    const venc = g.scoreA > g.scoreB ? teamA.name : teamB.name;
    r.subtitulo(`${i + 1}º set — ${g.scoreA} x ${g.scoreB}`, g.finished ? `venceu ${venc}` : '');
    r.par(
      { titulo: `Pontos de ${teamA.name}`, fatias: origem(doSet, teamA.id), pequena: true },
      { titulo: `Pontos de ${teamB.name}`, fatias: origem(doSet, teamB.id), pequena: true },
    );
    const ea = teamScout(doSet, teamA.id);
    const eb = teamScout(doSet, teamB.id);
    r.nota(`Erros cometidos no set: ${teamA.name} ${ea.errors} · ${teamB.name} ${eb.errors}`);
    r.y += 2;
  });

  // ── 3 e 4. Pontos e erros, do fundamento a quem fez ──
  const rallies = allRallies(match);
  const comElenco = times.filter((t) => rallies.some((x) => x.playerId && t.playerIds.includes(x.playerId)));
  const quem = (lista: Rally[]) => {
    const conta = new Map<string, number>();
    for (const x of lista) {
      const k = x.playerId ?? '';
      conta.set(k, (conta.get(k) ?? 0) + 1);
    }
    return [...conta.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, n]) => `${id ? nome(id) : 'Sem autor'} ${n}`)
      .join('   ');
  };

  for (const t of comElenco) {
    r.novaPagina();
    r.secao(`3. Pontos — ${t.name}`);
    const meus = rallies.filter((x) => x.kind === 'ponto' && x.teamId === t.id);
    r.sozinha(`${meus.length} pontos de mérito`, origem(match, t.id).filter((f) => f.label !== 'Erro do adversário'));
    for (const p of PONTOS) {
      const l = meus.filter((x) => x.action === p.action);
      if (l.length) r.item(p.label, l.length, SERIES[p.action], quem(l));
    }

    r.espaco(80);
    r.y += 4;
    r.secao(`4. Erros — ${t.name}`);
    const erros = rallies.filter((x) => x.kind === 'erro' && x.teamId !== t.id);
    r.sozinha(`${erros.length} erros cometidos`, errosDe(match, t.id));
    for (const e of ERROS) {
      const l = erros.filter((x) => x.action === e.action);
      if (l.length) r.item(e.label, l.length, SERIES[e.action], quem(l));
    }
  }

  // ── 5. Cada jogador ──
  for (const t of comElenco) {
    const ids = [...new Set(rallies.filter((x) => x.playerId && t.playerIds.includes(x.playerId)).map((x) => x.playerId!))];
    const linhas = ids
      .map((id) => {
        const feitos = rallies.filter((x) => x.playerId === id && x.kind === 'ponto');
        const errados = rallies.filter((x) => x.playerId === id && x.kind === 'erro');
        return { id, feitos, errados, saldo: feitos.length - errados.length };
      })
      .sort((a, b) => b.saldo - a.saldo || b.feitos.length - a.feitos.length);
    r.novaPagina();
    r.secao(`5. Jogadores — ${t.name}`);
    r.nota('Ordenados pelo saldo: pontos feitos menos erros cometidos.');
    for (const j of linhas) {
      const p = jogadorDe(j.id);
      const pos = p?.positions.volei ? getPositionLabel('volei', p.positions.volei) : '';
      const erros = ERROS.map((e) => ({ e, n: j.errados.filter((x) => x.action === e.action).length })).filter((x) => x.n);
      r.jogador({
        nome: nome(j.id),
        posicao: pos,
        saldo: j.saldo,
        fatias: PONTOS.map((x) => ({
          label: x.label,
          value: j.feitos.filter((f) => f.action === x.action).length,
          color: SERIES[x.action],
        })),
        erros: erros.map((x) => `${x.e.label} ${x.n}`),
        totalErros: j.errados.length,
      });
    }
  }

  return rodape(doc);
}

function rodape(doc: JsPDF): JsPDF {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text('Scout feito no TimeCerto', 15, 290);
    doc.text(`${i} / ${n}`, 195, 290, { align: 'right' });
  }
  return doc;
}

async function entregar(doc: JsPDF, match: Match) {
  const [teamA, teamB] = match.teams;

  const data = new Date(match.date).toISOString().slice(0, 10);
  const slug = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\w]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
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

/** O desenho do relatório: posição vertical, quebra de página, pizza e legenda */
class Relatorio {
  y = 18;
  readonly L = 15;
  readonly R = 195;
  private doc: JsPDF;
  constructor(doc: JsPDF) {
    this.doc = doc;
  }

  texto(s: string, size = 10, estilo: 'normal' | 'bold' = 'normal', cor = 30, x = this.L) {
    this.doc.setFont('helvetica', estilo);
    this.doc.setFontSize(size);
    this.doc.setTextColor(cor);
    this.doc.text(s, x, this.y);
  }

  espaco(mm: number) {
    if (this.y + mm > 282) this.novaPagina();
  }

  novaPagina() {
    this.doc.addPage();
    this.y = 18;
  }

  titulo(s: string, data: string) {
    this.texto(s, 18, 'bold');
    this.doc.setFontSize(10);
    this.doc.setFont('helvetica', 'normal');
    this.doc.text(data, this.R, this.y, { align: 'right' });
    this.y += 11;
  }

  secao(s: string) {
    this.espaco(20);
    this.y += 4;
    this.doc.setFillColor('#1e3a8a');
    this.doc.rect(this.L, this.y - 5, 2, 7, 'F');
    this.texto(s, 13, 'bold', 30, this.L + 5);
    this.y += 4;
    this.doc.setDrawColor(215);
    this.doc.line(this.L, this.y, this.R, this.y);
    this.y += 6;
  }

  subtitulo(s: string, direita: string) {
    this.texto(s, 11, 'bold');
    if (direita) {
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(9);
      this.doc.setTextColor(110);
      this.doc.text(direita, this.R, this.y, { align: 'right' });
    }
    this.y += 5;
  }

  nota(s: string) {
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(9);
    this.doc.setTextColor(100);
    const linhas = this.doc.splitTextToSize(s, this.R - this.L) as string[];
    this.espaco(linhas.length * 4.5 + 2);
    this.doc.text(linhas, this.L, this.y);
    this.y += linhas.length * 4.5 + 2;
  }

  /** Uma pizza: leque de triângulos a partir do topo, em sentido horário */
  pizza(cx: number, cy: number, raio: number, fatias: Fatia[]) {
    const total = fatias.reduce((a, f) => a + f.value, 0);
    if (!total) {
      this.doc.setFillColor('#e5e7eb');
      this.doc.circle(cx, cy, raio, 'F');
      this.doc.setFontSize(7);
      this.doc.setTextColor(120);
      this.doc.text('sem registro', cx, cy + 1, { align: 'center' });
      return;
    }
    let a0 = -Math.PI / 2;
    for (const f of fatias) {
      if (!f.value) continue;
      const a1 = a0 + (f.value / total) * Math.PI * 2;
      const passos = Math.max(2, Math.ceil((a1 - a0) / 0.05));
      const pts: [number, number][] = [[cx, cy]];
      for (let i = 0; i <= passos; i++) {
        const a = a0 + ((a1 - a0) * i) / passos;
        pts.push([cx + raio * Math.cos(a), cy + raio * Math.sin(a)]);
      }
      const deltas = pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]);
      this.doc.setFillColor(f.color);
      this.doc.lines(deltas, cx, cy, [1, 1], 'F', true);
      a0 = a1;
    }
    // Separação branca entre as fatias
    if (fatias.filter((f) => f.value).length > 1) {
      this.doc.setDrawColor(255);
      this.doc.setLineWidth(0.4);
      let a = -Math.PI / 2;
      for (const f of fatias) {
        if (!f.value) continue;
        this.doc.line(cx, cy, cx + raio * Math.cos(a), cy + raio * Math.sin(a));
        a += (f.value / total) * Math.PI * 2;
      }
      this.doc.setLineWidth(0.2);
    }
  }

  /** Legenda com cor, rótulo, quantidade e percentual; devolve a altura usada */
  legenda(x: number, y: number, fatias: Fatia[], largura: number) {
    const total = fatias.reduce((a, f) => a + f.value, 0);
    const visiveis = fatias.filter((f) => f.value);
    visiveis.forEach((f, i) => {
      const ly = y + i * 5;
      this.doc.setFillColor(f.color);
      this.doc.rect(x, ly - 2.6, 2.8, 2.8, 'F');
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(8.5);
      this.doc.setTextColor(40);
      this.doc.text(f.label, x + 4.5, ly);
      this.doc.setFont('helvetica', 'bold');
      this.doc.text(`${f.value}  (${Math.round((f.value / total) * 100)}%)`, x + largura, ly, { align: 'right' });
    });
    return visiveis.length * 5;
  }

  /** Duas pizzas lado a lado, com título e legenda */
  par(a: { titulo: string; fatias: Fatia[]; pequena?: boolean }, b: { titulo: string; fatias: Fatia[]; pequena?: boolean }) {
    const raio = a.pequena ? 11 : 15;
    const alt = Math.max(raio * 2, 30) + 10;
    this.espaco(alt);
    const meio = (this.L + this.R) / 2;
    [a, b].forEach((p, i) => {
      const x0 = i === 0 ? this.L : meio + 3;
      const total = p.fatias.reduce((s, f) => s + f.value, 0);
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(9.5);
      this.doc.setTextColor(30);
      this.doc.text(`${p.titulo} (${total})`, x0, this.y);
      this.pizza(x0 + raio, this.y + 4 + raio, raio, p.fatias);
      this.legenda(x0 + raio * 2 + 5, this.y + 8, p.fatias, meio - this.L - raio * 2 - 10);
    });
    this.y += alt;
  }

  /** Uma pizza grande com legenda, para o fundamento do time */
  sozinha(titulo: string, fatias: Fatia[]) {
    const raio = 18;
    this.espaco(raio * 2 + 12);
    this.texto(titulo, 10, 'bold');
    this.pizza(this.L + raio, this.y + 4 + raio, raio, fatias);
    this.legenda(this.L + raio * 2 + 10, this.y + 10, fatias, 80);
    this.y += raio * 2 + 12;
  }

  /** Um fundamento e quem fez: "Ataque 8 — Ana 4  Gabi 3 …" */
  item(label: string, n: number, cor: string, quem: string) {
    const linhas = (() => {
      this.doc.setFontSize(9);
      return this.doc.splitTextToSize(quem, this.R - this.L - 8) as string[];
    })();
    this.espaco(6 + linhas.length * 4.5);
    this.doc.setFillColor(cor);
    this.doc.rect(this.L, this.y - 2.8, 2.8, 2.8, 'F');
    this.texto(`${label}  ${n}`, 10, 'bold', 30, this.L + 5);
    this.y += 5;
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(9);
    this.doc.setTextColor(80);
    this.doc.text(linhas, this.L + 5, this.y);
    this.y += linhas.length * 4.5 + 2;
  }

  /** O cartão de um jogador: pizza dos pontos, erros e saldo */
  jogador(j: { nome: string; posicao: string; saldo: number; fatias: Fatia[]; erros: string[]; totalErros: number }) {
    const raio = 10;
    const linhas = Math.max(j.fatias.filter((f) => f.value).length, j.erros.length, 1);
    const alt = Math.max(raio * 2 + 8, 14 + linhas * 5) + 6;
    this.espaco(alt);
    const topo = this.y;
    this.doc.setDrawColor(225);
    this.doc.roundedRect(this.L, topo - 5, this.R - this.L, alt - 2, 2, 2, 'S');

    this.texto(j.nome, 11, 'bold', 30, this.L + 4);
    if (j.posicao) {
      const w = this.doc.getTextWidth(j.nome);
      this.texto(j.posicao, 9, 'normal', 110, this.L + 7 + w);
    }
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(11);
    this.doc.setTextColor(j.saldo > 0 ? '#15803d' : j.saldo < 0 ? '#b91c1c' : '#475569');
    this.doc.text(`saldo ${j.saldo > 0 ? '+' : ''}${j.saldo}`, this.R - 4, this.y, { align: 'right' });

    const pontos = j.fatias.reduce((a, f) => a + f.value, 0);
    this.pizza(this.L + 4 + raio, topo + 4 + raio, raio, j.fatias);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(9);
    this.doc.setTextColor(30);
    this.doc.text(`${pontos} ${pontos === 1 ? 'ponto' : 'pontos'}`, this.L + raio * 2 + 10, topo + 6);
    this.legenda(this.L + raio * 2 + 10, topo + 11, j.fatias, 55);

    const xe = this.L + 112;
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(9);
    this.doc.setTextColor(30);
    this.doc.text(`${j.totalErros} ${j.totalErros === 1 ? 'erro' : 'erros'}`, xe, topo + 6);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(8.5);
    this.doc.setTextColor(80);
    j.erros.forEach((e, i) => this.doc.text(e, xe, topo + 11 + i * 5));

    this.y = topo + alt;
  }
}
