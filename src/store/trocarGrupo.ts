import { useAppStore } from '@/store/useAppStore';
import { unificarElenco } from '@/store/unificarElenco';
import { useJogoStore } from '@/store/useJogoStore';
import { useMatchStore } from '@/store/useMatchStore';
import { useProStore } from '@/store/useProStore';
import { adotarLegado, BASES, chaveDe, definirGrupoAtivo, lerGrupoAtivo, type GrupoAtivo } from '@/lib/grupoAtivo';

/**
 * Aponta os stores para a chave de um grupo (ou para a antiga, sem grupo) e
 * lê de novo. Volta ao estado inicial antes de ler: grupo que ainda não tem
 * nada guardado tem de abrir vazio, e não com o conteúdo do anterior.
 *
 * O que estava na tela já está gravado — o persist grava a cada mudança —,
 * então trocar não perde nada do grupo que se deixa.
 */
async function apontar(id: string | null) {
  // Cada store com a sua base de chave (lib/grupoAtivo.ts)
  await Promise.all([
    reler(useAppStore, chaveDe(BASES.app, id)),
    reler(useJogoStore, chaveDe(BASES.jogos, id)),
    reler(useMatchStore, chaveDe(BASES.partidas, id)),
    reler(useProStore, chaveDe(BASES.pro, id)),
  ]);
}

interface ComPersist<T> {
  getInitialState: () => T;
  setState: (state: T, replace: true) => void;
  persist: { setOptions: (o: { name: string }) => void; rehydrate: () => Promise<void> | void };
}

const RASCUNHO = 'timecerto:trocando-de-grupo';

async function reler<T>(store: ComPersist<T>, name: string) {
  // Zerar GRAVA: o persist salva a cada setState. Zerado na chave nova, o
  // estado vazio cairia por cima do que o grupo tem guardado — e do que a
  // adoção do legado acabou de copiar (perdeu o elenco profissional no teste
  // de 30/09/2026). Por isso zera numa chave de rascunho, e só depois aponta
  // para a do grupo e lê
  store.persist.setOptions({ name: RASCUNHO });
  store.setState(store.getInitialState(), true);
  store.persist.setOptions({ name });
  await store.persist.rehydrate();
  try {
    localStorage.removeItem(RASCUNHO);
  } catch {
    /* sem armazenamento */
  }
}

/**
 * Entra num grupo: adota o legado do tipo dele, se for o caso, lembra como
 * ativo e troca o conteúdo do aparelho pelo dele. O tipo do app (amador ou
 * profissional) vem do grupo (etapa 7).
 */
export async function ativarGrupo(g: GrupoAtivo): Promise<void> {
  adotarLegado(g);
  definirGrupoAtivo(g);
  await apontar(g.id);
  useAppStore.getState().setMode(g.mode);
  // O elenco do time, se ainda estava no store antigo, vai para o cadastro único
  unificarElenco();
}

/**
 * Sai de qualquer grupo: o aparelho volta à chave antiga, sem grupo. É o que
 * vale para quem escolhe um tipo em que ainda não tem grupo — o conteúdo
 * daquele tipo que o aparelho tinha (o legado ainda não adotado) está lá, e
 * vai junto quando o grupo for criado.
 */
export async function sairDoGrupo(mode: GrupoAtivo['mode']): Promise<void> {
  definirGrupoAtivo(null);
  await apontar(null);
  useAppStore.getState().setMode(mode);
}

/** O nome mudou (ou chegou): só atualiza a lembrança, sem trocar nada */
export function lembrarNome(id: string, name: string) {
  const g = lerGrupoAtivo();
  if (g && g.id === id && g.name !== name) definirGrupoAtivo({ ...g, name });
}

/** Categoria e naipe do time mudaram (ou chegaram): só a lembrança */
export function lembrarPerfil(id: string, ageGroup: GrupoAtivo['ageGroup'], naipe: GrupoAtivo['naipe']) {
  const g = lerGrupoAtivo();
  if (g && g.id === id && (g.ageGroup !== ageGroup || g.naipe !== naipe)) definirGrupoAtivo({ ...g, ageGroup, naipe });
}

/**
 * Perdeu o acesso ao grupo ativo: apaga a cópia DELE deste aparelho e sai
 * dele. Os outros grupos guardados no aparelho ficam.
 */
export async function esquecerGrupo(id: string): Promise<void> {
  for (const base of Object.values(BASES)) {
    try {
      localStorage.removeItem(chaveDe(base, id));
    } catch {
      /* sem armazenamento */
    }
  }
  if (lerGrupoAtivo()?.id === id) {
    definirGrupoAtivo(null);
    await apontar(null);
    // Sem tipo lembrado, a abertura pergunta à nuvem que grupos restaram
    useAppStore.setState({ mode: null });
  }
}
