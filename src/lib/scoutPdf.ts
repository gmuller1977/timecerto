import type { jsPDF as JsPDF } from 'jspdf';
import type { Game, Match, Player, Rally, VolleyAction } from '@/types';
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
  // Todas as páginas deitadas (pedido do Guilherme em 08/10/2026)
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
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

  // ── 3. A evolução do placar, ponto a ponto, uma página deitada por set ──
  const curto = (id?: string) => {
    if (!id) return '';
    const p = jogadorDe(id);
    const n = match.camisas?.[id] ?? p?.numero;
    const c = p ? p.nickname?.trim() || p.name.split(' ')[0] : 'Jogador';
    return n != null ? `${n} · ${c}` : c;
  };
  match.games.forEach((g, i) => {
    if ((g.rallies ?? []).length) graficoDoSet(doc, match, g, i, curto);
  });

  // ── 4 e 5. Pontos e erros, do fundamento a quem fez ──
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
    r.secao(`4. Pontos — ${t.name}`);
    const meus = rallies.filter((x) => x.kind === 'ponto' && x.teamId === t.id);
    r.sozinha(`${meus.length} pontos de mérito`, origem(match, t.id).filter((f) => f.label !== 'Erro do adversário'));
    for (const p of PONTOS) {
      const l = meus.filter((x) => x.action === p.action);
      if (l.length) r.item(p.label, l.length, SERIES[p.action], quem(l));
    }

    // Os erros começam em página própria: na deitada, dividir a seção deixava sobra
    r.novaPagina();
    r.secao(`5. Erros — ${t.name}`);
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
    r.secao(`6. Jogadores — ${t.name}`);
    r.nota('Ordenados pelo saldo: pontos feitos menos erros cometidos.');
    // Dois cartões por linha, para aproveitar a página deitada
    const cartoes = linhas.map((j) => {
      const p = jogadorDe(j.id);
      const pos = p?.positions.volei ? getPositionLabel('volei', p.positions.volei) : '';
      const erros = ERROS.map((e) => ({ e, n: j.errados.filter((x) => x.action === e.action).length })).filter((x) => x.n);
      return {
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
      };
    });
    for (let i = 0; i < cartoes.length; i += 2) r.duplaDeJogadores(cartoes.slice(i, i + 2));
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
    // A página do gráfico é deitada: o rodapé segue o tamanho de cada uma
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    doc.text('Scout feito no TimeCerto', 15, h - 7);
    doc.text(`${i} / ${n}`, w - 15, h - 7, { align: 'right' });
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

/**
 * O gráfico de linha de um set (pedido do Guilherme em 08/10/2026): o placar
 * dos dois times rally a rally, uma bolinha em cada ponto na linha de quem
 * pontuou, com a cor do fundamento. A descrição de cada ponto vai numa faixa
 * — em cima a do primeiro time, embaixo a do segundo — alinhada à bolinha:
 * escrita em cima do gráfico, num set de 45 pontos, ninguém leria nada.
 */
function graficoDoSet(doc: JsPDF, match: Match, g: Game, idx: number, curto: (id?: string) => string) {
  doc.addPage('a4', 'landscape');
  const [teamA, teamB] = match.teams;
  const rallies = g.rallies ?? [];
  const L = 22;
  const R = 282;
  const faixaA = [24, 56] as const;
  const area = [60, 150] as const;
  const faixaB = [154, 186] as const;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(30);
  doc.setFillColor('#1e3a8a');
  doc.rect(15, 9, 2, 7, 'F');
  doc.text(`3. Evolução do placar — ${idx + 1}º set, ${g.scoreA} x ${g.scoreB}`, 20, 14);

  // Legenda: as duas linhas e os fundamentos
  const LINHA_A = '#1e293b';
  const LINHA_B = '#94a3b8';
  let lx = 20;
  // Cada item: o desenho (recebe o x onde começa) e o texto ao lado
  const legenda = (desenho: (x: number) => void, texto: string) => {
    desenho(lx);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(60);
    doc.text(texto, lx + 6, 20.5);
    lx += 8 + doc.getTextWidth(texto) + 4;
  };
  const traco = (cor: string) => (x: number) => {
    doc.setDrawColor(cor);
    doc.setLineWidth(0.8);
    doc.line(x, 19.5, x + 4.5, 19.5);
    doc.setLineWidth(0.2);
  };
  legenda(traco(LINHA_A), teamA.name);
  legenda(traco(LINHA_B), teamB.name);
  for (const p of PONTOS) {
    legenda((x) => {
      doc.setFillColor(SERIES[p.action]);
      doc.circle(x + 2, 19.5, 1.3, 'F');
    }, p.label);
  }
  legenda((x) => {
    doc.setDrawColor('#6e6e6e');
    doc.setFillColor('#ffffff');
    doc.setLineWidth(0.35);
    doc.circle(x + 2, 19.5, 1.2, 'FD');
    doc.setLineWidth(0.2);
  }, 'Erro do adversário');

  // Escalas
  const n = rallies.length;
  const maxY = Math.max(g.scoreA, g.scoreB, 1);
  const X = (i: number) => L + ((R - L) * i) / Math.max(n, 1);
  const Y = (v: number) => area[1] - ((area[1] - area[0]) * v) / maxY;

  // Grade a cada 5 pontos
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  for (let v = 0; v <= maxY; v += 5) {
    doc.setDrawColor(232);
    doc.line(L, Y(v), R, Y(v));
    doc.setTextColor(130);
    doc.text(String(v), L - 2, Y(v) + 1, { align: 'right' });
  }
  doc.setDrawColor(190);
  doc.line(L, area[1], R, area[1]);

  // Guia vertical fraca de cada ponto até a faixa da descrição
  rallies.forEach((r, i) => {
    const doA = r.teamId === g.teamAId;
    const x = X(i + 1);
    const y = Y(doA ? r.scoreA : r.scoreB);
    doc.setDrawColor(238);
    doc.setLineDashPattern([0.6, 0.8], 0);
    doc.line(x, doA ? faixaA[1] + 1 : y, x, doA ? y : faixaB[0] - 1);
    doc.setLineDashPattern([], 0);
  });

  // As duas linhas
  const linha = (cor: string, valor: (r: Rally) => number) => {
    doc.setDrawColor(cor);
    doc.setLineWidth(0.6);
    let px = X(0);
    let py = Y(0);
    rallies.forEach((r, i) => {
      const x = X(i + 1);
      const y = Y(valor(r));
      doc.line(px, py, x, y);
      px = x;
      py = y;
    });
    doc.setLineWidth(0.2);
  };
  linha(LINHA_B, (r) => r.scoreB);
  linha(LINHA_A, (r) => r.scoreA);

  // A bolinha de cada ponto e a descrição na faixa do time
  const raio = Math.min(1.4, ((R - L) / Math.max(n, 1)) * 0.3);
  const fonte = Math.min(6.5, Math.max(4.5, ((R - L) / Math.max(n, 1)) * 1.3));
  rallies.forEach((r, i) => {
    const doA = r.teamId === g.teamAId;
    const x = X(i + 1);
    const y = Y(doA ? r.scoreA : r.scoreB);
    if (r.kind === 'ponto') {
      doc.setFillColor(SERIES[r.action]);
      doc.circle(x, y, raio, 'F');
    } else {
      doc.setDrawColor('#6e6e6e');
      doc.setFillColor('#ffffff');
      doc.setLineWidth(0.35);
      doc.circle(x, y, raio * 0.9, 'FD');
      doc.setLineWidth(0.2);
    }

    const tipo =
      r.kind === 'ponto'
        ? (PONTOS.find((p) => p.action === r.action)?.label ?? 'Ponto')
        : (ERROS.find((e) => e.action === r.action)?.label ?? 'Erro');
    const quem = curto(r.playerId);
    const texto =
      r.kind === 'ponto'
        ? [quem, tipo].filter(Boolean).join(' · ')
        : `Erro: ${tipo.replace(/^Erro de /, '')}${quem ? ` (${quem})` : ''}`;
    doc.setFont('helvetica', r.kind === 'ponto' ? 'bold' : 'normal');
    doc.setFontSize(fonte);
    doc.setTextColor(r.kind === 'ponto' ? 40 : 120);
    const larg = Math.min(doc.getTextWidth(texto), 31);
    // Texto de baixo para cima; em cima encosta no gráfico, embaixo também
    if (doA) doc.text(texto, x + fonte * 0.12, faixaA[1], { angle: 90, maxWidth: 31 });
    else doc.text(texto, x + fonte * 0.12, faixaB[0] + larg, { angle: 90, maxWidth: 31 });
  });

  // Nome das faixas
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(LINHA_A);
  doc.text(teamA.name, L - 2, faixaA[1], { angle: 90 });
  doc.setTextColor(LINHA_B);
  doc.text(teamB.name, L - 2, faixaB[1], { angle: 90 });
}

/** O desenho do relatório: posição vertical, quebra de página, pizza e legenda */
class Relatorio {
  y = 18;
  readonly L = 15;
  readonly R = 282;
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
    if (this.y + mm > 195) this.novaPagina();
  }

  novaPagina() {
    this.doc.addPage('a4', 'landscape');
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
      this.legenda(x0 + raio * 2 + 5, this.y + 8, p.fatias, Math.min(75, meio - this.L - raio * 2 - 10));
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

  /** Dois cartões lado a lado: a linha tem a altura do mais alto */
  duplaDeJogadores(js: Cartao[]) {
    const alt = Math.max(...js.map((j) => this.alturaDoCartao(j)));
    this.espaco(alt);
    const larg = (this.R - this.L - 6) / 2;
    js.forEach((j, i) => this.cartao(j, this.L + i * (larg + 6), larg, alt));
    this.y += alt;
  }

  alturaDoCartao(j: Cartao) {
    const linhas = Math.max(j.fatias.filter((f) => f.value).length, j.erros.length, 1);
    return Math.max(10 * 2 + 8, 14 + linhas * 5) + 6;
  }

  /** O cartão de um jogador: pizza dos pontos, erros e saldo */
  cartao(j: Cartao, x0: number, larg: number, alt: number) {
    const raio = 10;
    const topo = this.y;
    this.doc.setDrawColor(225);
    this.doc.roundedRect(x0, topo - 5, larg, alt - 2, 2, 2, 'S');

    this.texto(j.nome, 11, 'bold', 30, x0 + 4);
    if (j.posicao) {
      const w = this.doc.getTextWidth(j.nome);
      this.texto(j.posicao, 9, 'normal', 110, x0 + 7 + w);
    }
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(11);
    this.doc.setTextColor(j.saldo > 0 ? '#15803d' : j.saldo < 0 ? '#b91c1c' : '#475569');
    this.doc.text(`saldo ${j.saldo > 0 ? '+' : ''}${j.saldo}`, x0 + larg - 4, topo, { align: 'right' });

    const pontos = j.fatias.reduce((a, f) => a + f.value, 0);
    this.pizza(x0 + 4 + raio, topo + 4 + raio, raio, j.fatias);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(9);
    this.doc.setTextColor(30);
    this.doc.text(`${pontos} ${pontos === 1 ? 'ponto' : 'pontos'}`, x0 + raio * 2 + 10, topo + 6);
    this.legenda(x0 + raio * 2 + 10, topo + 11, j.fatias, 45);

    const xe = x0 + raio * 2 + 62;
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(9);
    this.doc.setTextColor(30);
    this.doc.text(`${j.totalErros} ${j.totalErros === 1 ? 'erro' : 'erros'}`, xe, topo + 6);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(8.5);
    this.doc.setTextColor(80);
    j.erros.forEach((e, i) => this.doc.text(e, xe, topo + 11 + i * 5));
  }
}

interface Cartao {
  nome: string;
  posicao: string;
  saldo: number;
  fatias: Fatia[];
  erros: string[];
  totalErros: number;
}
