import type { AgeGroup, AppMode, Naipe } from '@/types';

/**
 * Multi-grupo (docs/telas-amador.md, etapa 8). O aparelho guarda UM grupo
 * ativo, e cada store persistido guarda o seu conteúdo numa chave própria
 * daquele grupo: `timecerto:v1@<id>`. Trocar de grupo é trocar de chave.
 *
 * Este módulo não importa store nenhum — os stores importam dele para saber
 * a chave com que nascem. Quem troca de grupo em tempo de execução é
 * `store/trocarGrupo.ts`.
 *
 * O LEGADO. Antes da etapa 8 cada store tinha uma chave só, sem grupo, com o
 * conteúdo dos DOIS modos misturado: atletas e jogos da pelada, elenco do
 * profissional, e partidas de ambos no mesmo store. Na primeira vez que um
 * grupo de cada tipo fica ativo, o legado daquele tipo é ADOTADO por ele —
 * copiado para a chave do grupo e retirado da chave antiga. Nada é apagado
 * antes de estar copiado, e cada tipo é adotado uma vez só: o segundo grupo
 * de um tipo nasce vazio, como deve.
 */

export interface GrupoAtivo {
  id: string;
  mode: AppMode;
  name?: string;
  /** Do time (migração 024): o padrão de todo atleta novo, também sem rede */
  ageGroup?: AgeGroup | null;
  naipe?: Naipe | null;
}

export const BASES = {
  app: 'timecerto:v1',
  jogos: 'timecerto:jogos:v1',
  partidas: 'timecerto:matches:v1',
  pro: 'timecerto:pro:v1',
} as const;

const CHAVE_ATIVO = 'timecerto:grupo-ativo';
const CHAVE_ADOTADO = 'timecerto:legado-adotado';
// A marca de SincronizacaoNuvem de antes da etapa 8: o grupo amador que este
// aparelho sincronizou. Diz de quem é o legado amador
const MARCA_ANTIGA = 'timecerto:grupo-nuvem';

function ler<T>(chave: string): T | null {
  try {
    const v = localStorage.getItem(chave);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

function gravar(chave: string, valor: unknown) {
  try {
    if (valor === null) localStorage.removeItem(chave);
    else localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    /* sem armazenamento: o app segue na memória */
  }
}

export function lerGrupoAtivo(): GrupoAtivo | null {
  return ler<GrupoAtivo>(CHAVE_ATIVO);
}

export function definirGrupoAtivo(g: GrupoAtivo | null) {
  gravar(CHAVE_ATIVO, g);
  avisarMudanca();
}

export const chaveDe = (base: string, id: string | null | undefined) => (id ? `${base}@${id}` : base);

// ── A adoção do legado ──

type Persistido = { state: Record<string, unknown>; version?: number };
type Partida = { mode?: string };
type Ao = { pro?: boolean } | null;

const ehPro = (m: Partida) => m.mode === 'profissional';

/**
 * Para cada store: o que vai para o grupo e o que fica na chave antiga. Um
 * `null` no grupo quer dizer "não copie nada" (o store nasce no padrão).
 */
const SEPARAR: Record<keyof typeof BASES, (s: Record<string, unknown>, mode: AppMode) => [Record<string, unknown> | null, Record<string, unknown>]> = {
  app: (s, mode) => {
    const semPelada = { ...s, players: [], excluidos: [], squads: [], lastResult: null, history: [], leituraNuvem: undefined };
    return mode === 'amador' ? [{ ...s, mode: 'amador' }, semPelada] : [{ ...semPelada, mode: 'profissional' }, s];
  },
  jogos: (s, mode) => {
    const vazio = { ...s, jogos: [], leituraJogos: undefined };
    return mode === 'amador' ? [s, vazio] : [vazio, s];
  },
  partidas: (s, mode) => {
    const matches = (s.matches as Partida[] | undefined) ?? [];
    const live = (s.live as Ao) ?? null;
    const doPro = { ...s, matches: matches.filter(ehPro), live: live?.pro ? live : null, excluidas: [], leituraPartidas: undefined };
    const daPelada = { ...s, matches: matches.filter((m) => !ehPro(m)), live: live && !live.pro ? live : null };
    return mode === 'amador' ? [daPelada, doPro] : [doPro, { ...daPelada, excluidas: s.excluidas }];
  },
  pro: (s, mode) => (mode === 'profissional' ? [s, { ...s, players: [], lastLineup: null }] : [null, s]),
};

/**
 * Adota o legado do tipo do grupo, se ainda não foi adotado e se é dele.
 * Síncrona: roda antes de os stores lerem a chave nova.
 */
export function adotarLegado(g: GrupoAtivo) {
  const adotado = ler<Partial<Record<AppMode, string>>>(CHAVE_ADOTADO) ?? {};
  if (adotado[g.mode]) return;
  // O legado amador é do grupo que este aparelho sincronizava. Outro grupo
  // amador não o leva — nasce vazio, e o legado espera o dono dele
  const marca = (() => {
    try {
      return localStorage.getItem(MARCA_ANTIGA);
    } catch {
      return null;
    }
  })();
  if (g.mode === 'amador' && marca && marca !== g.id) return;

  for (const [k, base] of Object.entries(BASES) as [keyof typeof BASES, string][]) {
    const legado = ler<Persistido>(base);
    if (!legado?.state) continue;
    const destino = chaveDe(base, g.id);
    const [doGrupo, resto] = SEPARAR[k](legado.state, g.mode);
    // Cópia primeiro; a chave antiga só perde o conteúdo depois
    if (doGrupo && !ler(destino)) gravar(destino, { ...legado, state: doGrupo });
    gravar(base, { ...legado, state: resto });
  }
  gravar(CHAVE_ADOTADO, { ...adotado, [g.mode]: g.id });
}

/**
 * Aparelho de antes da etapa 8 que já sabia o seu grupo amador (a marca da
 * sincronização): adota ali mesmo, ao carregar, para abrir já no grupo — sem
 * esperar a rede. Só se o aparelho estava no modo amador; quem estava no
 * profissional continua onde estava até a sincronização decidir.
 */
function prepararAoCarregar() {
  if (lerGrupoAtivo()) return;
  let marca: string | null = null;
  try {
    marca = localStorage.getItem(MARCA_ANTIGA);
  } catch {
    return;
  }
  if (!marca) return;
  const modo = ler<Persistido>(BASES.app)?.state?.mode;
  if (modo === 'profissional') return;
  const g: GrupoAtivo = { id: marca, mode: 'amador' };
  adotarLegado(g);
  definirGrupoAtivo(g);
}

let preparado = false;

/** A chave com que um store nasce: a do grupo ativo, ou a antiga sem grupo */
export function chaveInicial(base: string): string {
  if (!preparado) {
    preparado = true;
    prepararAoCarregar();
  }
  return chaveDe(base, lerGrupoAtivo()?.id);
}

// ── Avisar quem mostra o grupo, e a lista guardada ──

const EVENTO = 'timecerto:grupo-ativo';
const CHAVE_LISTA = 'timecerto:meus-grupos';

export interface GrupoDaLista extends GrupoAtivo {
  name: string;
  papel: 'dono' | 'administrador';
}

/** Chamado a cada mudança do grupo ativo: a faixa da barra redesenha */
export function avisarMudanca() {
  try {
    window.dispatchEvent(new Event(EVENTO));
  } catch {
    /* fora do navegador */
  }
}

export function ouvirMudanca(f: () => void): () => void {
  window.addEventListener(EVENTO, f);
  window.addEventListener('storage', f);
  return () => {
    window.removeEventListener(EVENTO, f);
    window.removeEventListener('storage', f);
  };
}

/** O texto guardado, para comparar sem criar objeto novo a cada leitura */
export const grupoAtivoCru = () => {
  try {
    return localStorage.getItem(CHAVE_ATIVO);
  } catch {
    return null;
  }
};

/**
 * A lista dos grupos da conta, como a nuvem respondeu da última vez. É o que
 * deixa trocar de grupo sem rede: o conteúdo de cada um já está no aparelho.
 */
export function lerGruposGuardados(): GrupoDaLista[] {
  return ler<GrupoDaLista[]>(CHAVE_LISTA) ?? [];
}

export function guardarGrupos(lista: GrupoDaLista[]) {
  gravar(CHAVE_LISTA, lista);
  avisarMudanca();
}
