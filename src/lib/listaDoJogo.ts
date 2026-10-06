/**
 * O texto da lista do jogo para o grupo do WhatsApp (pedido do Guilherme em
 * 29/09/2026). Duas portas mandam a mesma coisa: quem confirma pelo link
 * ("Mandar a lista atualizada no grupo") e o administrador, na página do
 * jogo. Um formato só, para o grupo ler sempre igual.
 *
 * O app não posta sozinho no grupo — o WhatsApp não deixa sem a API paga ou
 * um robô que arrisca banir o número. A mensagem sai pronta; alguém envia.
 */

/**
 * Quem é mensalista e quem é convidado, nas listas (pedido do Guilherme em
 * 06/10/2026): Ⓜ️ e 🎟️ (ingresso). Os mesmos na mensagem do WhatsApp, no link
 * e na página do dia — trocar aqui troca em todos.
 */
export const ICONE_DO_TIPO = { mensalista: 'Ⓜ️', convidado: '🎟️' } as const;
export const iconeDoTipo = (kind: string | null | undefined) =>
  kind === 'convidado' ? ICONE_DO_TIPO.convidado : ICONE_DO_TIPO.mensalista;

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
  /** Vagas ainda livres; null = sem limite */
  livres: number | null;
  /** Lista fechada: só resta a lista de espera */
  fechada: boolean;
  link?: string;
}): string {
  const numerada = (nomes: string[]) => nomes.map((n, i) => `${i + 1}. ${n}`).join('\n');
  const partes = [
    `⚡ ${p.grupo} · ${quandoDoJogo(p.inicio)}${p.local ? ` · ${p.local}` : ''}`,
    `*Confirmados (${p.confirmados.length}${p.vagas != null ? ` de ${p.vagas}` : ''})*\n` +
      (p.confirmados.length
        ? numerada(p.confirmados.map((c) => `${c.convidado ? ICONE_DO_TIPO.convidado : ICONE_DO_TIPO.mensalista} ${c.nome}`))
        : 'Ninguém ainda.'),
  ];
  if (p.fila.length) partes.push(`*Na fila*\n${numerada(p.fila)}`);
  if (p.espera.length) partes.push(`*Lista de espera*\n${numerada(p.espera)}`);
  // "Entre na lista" só quando as vagas acabaram (pedido do Guilherme,
  // 29/09/2026); com vaga, o convite é para confirmar
  if (p.link) {
    const completa = p.fechada || p.livres === 0;
    partes.push(
      completa
        ? `Vagas completas. Entre na lista de espera: ${p.link}`
        : p.livres == null
          ? `Confirme sua presença: ${p.link}`
          : `Ainda há ${p.livres} ${p.livres === 1 ? 'vaga' : 'vagas'}. Confirme sua presença: ${p.link}`,
    );
  }
  return partes.join('\n\n');
}
