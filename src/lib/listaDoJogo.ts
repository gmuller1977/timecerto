/**
 * O texto da lista do jogo para o grupo do WhatsApp (pedido do Guilherme em
 * 29/09/2026). Duas portas mandam a mesma coisa: quem confirma pelo link
 * ("Mandar a lista atualizada no grupo") e o administrador, na página do
 * jogo. Um formato só, para o grupo ler sempre igual.
 *
 * O app não posta sozinho no grupo — o WhatsApp não deixa sem a API paga ou
 * um robô que arrisca banir o número. A mensagem sai pronta; alguém envia.
 */

export interface LinhaDaLista {
  nome: string;
  convidado: boolean;
}

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** "sábado, 04/10 às 20:00", no fuso do aparelho */
export function quandoDoJogo(inicio: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${DIAS[inicio.getDay()]}, ${p(inicio.getDate())}/${p(inicio.getMonth() + 1)} às ${p(inicio.getHours())}:${p(inicio.getMinutes())}`;
}

export function textoDaLista(p: {
  grupo: string;
  inicio: Date;
  local?: string | null;
  vagas: number | null;
  /** Mensalistas na ordem em que confirmaram, depois os convidados com vaga */
  confirmados: LinhaDaLista[];
  /** Convidados esperando vaga, com a lista aberta */
  fila: string[];
  /** Lista fechada: quem espera ser chamado (e quem já foi) */
  espera: string[];
  link?: string;
}): string {
  const numerada = (nomes: string[]) => nomes.map((n, i) => `${i + 1}. ${n}`).join('\n');
  const partes = [
    `⚡ ${p.grupo} · ${quandoDoJogo(p.inicio)}${p.local ? ` · ${p.local}` : ''}`,
    `*Confirmados (${p.confirmados.length}${p.vagas != null ? ` de ${p.vagas}` : ''})*\n` +
      (p.confirmados.length
        ? numerada(p.confirmados.map((c) => (c.convidado ? `${c.nome} (conv.)` : c.nome)))
        : 'Ninguém ainda.'),
  ];
  if (p.fila.length) partes.push(`*Na fila*\n${numerada(p.fila)}`);
  if (p.espera.length) partes.push(`*Lista de espera*\n${numerada(p.espera)}`);
  if (p.link) partes.push(`Confirme ou entre na lista: ${p.link}`);
  return partes.join('\n\n');
}
