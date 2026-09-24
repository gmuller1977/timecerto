import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';
import { useProStore } from '@/store/useProStore';
import type { AppMode, ConfirmacaoStatus, DrawResult, Jogo, Player, PlayerKind, TeamColor } from '@/types';

/**
 * Tudo o que fala com o banco em nome do ORGANIZADOR (logado, sob RLS).
 * O convidado sem conta usa só as funções guest_* do fim do arquivo.
 *
 * Elenco AMADOR: a nuvem é a base comum de todos os aparelhos da conta (base
 * única, fase 1 — `syncAmador`). Cada aparelho envia o que editou e traz o que
 * os outros editaram; vale a edição mais recente.
 *
 * Elenco PROFISSIONAL: ainda no modelo antigo — o aparelho é a fonte e a nuvem
 * recebe uma cópia (`syncPro`).
 */

export interface CloudGroup {
  id: string;
  name: string;
  /** Link dos mensalistas */
  code: string;
  /** Link de convidados (só amador) */
  guestCode: string | null;
  /** Link de cadastro de mensalistas (só amador) */
  registerCode: string | null;
}

export interface CloudEvent {
  id: string;
  title: string | null;
  startsAt: string;
  /** Vagas do jogo; null = sem limite */
  slots: number | null;
  location: string | null;
  /** Lista fechada: o link não aceita mais resposta, mas o jogo continua nele */
  listClosed: boolean;
  /** Sorteio publicado no link; null = ainda não publicado */
  teams: PublishedTeams | null;
}

/**
 * O sorteio como vai para o link: só ids da NUVEM. O nome sai da lista que o
 * link já recebe (com apelido), e o nível nunca sai do aparelho.
 */
export interface PublishedTeams {
  drawnAt: string;
  teams: { name: string; color: TeamColor; players: string[] }[];
  bench: string[];
}

/** Resposta de cada jogador, pelo id da NUVEM */
export type Attendance = Record<string, { status: 'vou' | 'nao_vou'; answeredAt: string }>;

const GROUP_COLS = 'id, name, invite_code, guest_code, register_code';
const toGroup = (d: {
  id: string;
  name: string;
  invite_code: string;
  guest_code: string | null;
  register_code: string | null;
}): CloudGroup => ({
  id: d.id,
  name: d.name,
  code: d.invite_code,
  guestCode: d.guest_code,
  registerCode: d.register_code,
});
const EVENT_COLS = 'id, title, starts_at, slots, location, list_closed, teams';
const toEvent = (d: {
  id: string;
  title: string | null;
  starts_at: string;
  slots: number | null;
  location: string | null;
  list_closed: boolean | null;
  teams: PublishedTeams | null;
}): CloudEvent => ({
  id: d.id,
  title: d.title,
  startsAt: d.starts_at,
  slots: d.slots,
  location: d.location,
  listClosed: Boolean(d.list_closed),
  teams: d.teams ?? null,
});

function db() {
  if (!supabase) throw new Error('Supabase não configurado');
  return supabase;
}

async function uid(): Promise<string> {
  const { data } = await db().auth.getUser();
  if (!data.user) throw new Error('Sem sessão');
  return data.user.id;
}

/**
 * O grupo deste modo, em qualquer aparelho: o que a pessoa criou e, se não
 * criou nenhum, o grupo em que ela é administradora (convite por link,
 * migração 012). Um grupo por conta e por modo — quem tem grupo próprio e
 * aceita administrar outro continua vendo o próprio.
 */
export async function findMyGroup(mode: AppMode): Promise<CloudGroup | null> {
  const eu = await uid();
  const { data, error } = await db()
    .from('groups')
    .select(GROUP_COLS)
    .eq('owner_id', eu)
    .eq('mode', mode)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (data) return toGroup(data);

  const { data: membros, error: e2 } = await db()
    .from('group_members')
    .select('group_id, created_at')
    .eq('user_id', eu)
    .eq('role', 'organizador')
    .order('created_at');
  if (e2) throw e2;
  if (!membros || membros.length === 0) return null;
  const { data: grupos, error: e3 } = await db()
    .from('groups')
    .select(GROUP_COLS)
    .in('id', membros.map((m) => m.group_id))
    .eq('mode', mode);
  if (e3) throw e3;
  // O mais antigo em que virou administrador
  const ordem = new Map(membros.map((m, i) => [m.group_id, i]));
  const g = (grupos ?? []).sort((a, b) => (ordem.get(a.id) ?? 0) - (ordem.get(b.id) ?? 0))[0];
  return g ? toGroup(g) : null;
}

// ── Administradores (migração 012) ──────────────────────────

export interface Administrador {
  userId: string;
  role: 'dono' | 'organizador';
  name: string;
  avatarUrl: string | null;
  desde: string;
  souEu: boolean;
}

export interface ConviteAdmin {
  token: string;
  expiresAt: string;
}

/** Link de convite de administrador — uso único, vale 48 h */
export const adminLink = (token: string) => `${base()}#/admin/${token}`;

export async function administradores(groupId: string): Promise<Administrador[]> {
  const { data, error } = await db().rpc('admins_do_grupo', { gid: groupId });
  if (error) throw error;
  return (data ?? []) as Administrador[];
}

/** Só o dono consegue (RLS): gera um convite novo */
export async function criarConviteAdmin(groupId: string): Promise<ConviteAdmin> {
  const { data, error } = await db()
    .from('admin_invites')
    .insert({ group_id: groupId })
    .select('token, expires_at')
    .single();
  if (error) throw error;
  return { token: data.token, expiresAt: data.expires_at };
}

/** Convites ainda válidos e não usados */
export async function convitesAdminAbertos(groupId: string): Promise<ConviteAdmin[]> {
  const { data, error } = await db()
    .from('admin_invites')
    .select('token, expires_at')
    .eq('group_id', groupId)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((d) => ({ token: d.token, expiresAt: d.expires_at }));
}

export async function cancelarConviteAdmin(token: string): Promise<void> {
  const { error } = await db().from('admin_invites').delete().eq('token', token);
  if (error) throw error;
}

/** O dono remove um administrador, ou o administrador sai sozinho (RLS decide) */
export async function removerAdmin(groupId: string, userId: string): Promise<void> {
  const { error } = await db()
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .neq('role', 'dono');
  if (error) throw error;
}

export interface InfoConviteAdmin {
  group: string;
  mode: AppMode;
  expirado: boolean;
  usado: boolean;
  usadoPorMim: boolean;
}

export async function conviteAdminInfo(token: string): Promise<InfoConviteAdmin> {
  const { data, error } = await db().rpc('convite_admin_info', { p_token: token });
  if (error) throw error;
  return data as InfoConviteAdmin;
}

export async function aceitarConviteAdmin(token: string): Promise<{ group: string; mode: AppMode }> {
  const { data, error } = await db().rpc('aceitar_convite_admin', { p_token: token });
  if (error) throw error;
  return data as { group: string; mode: AppMode };
}

export async function createGroup(mode: AppMode, name: string): Promise<CloudGroup> {
  const sport = mode === 'profissional' ? 'volei' : useAppStore.getState().sport;
  const { data, error } = await db()
    .from('groups')
    .insert({ name: name.trim(), sport, mode, owner_id: await uid() })
    .select(GROUP_COLS)
    .single();
  if (error) throw error;
  return toGroup(data);
}

/**
 * Base única do elenco amador (fase 1): envia o que ESTE aparelho editou e
 * traz o que os outros editaram. Vale a edição mais recente (`updatedAt`), e
 * quem decide é o servidor (`salvar_jogadores`, migração 010) — um aparelho
 * desatualizado não atropela o que outro gravou depois.
 *
 * Nada é desativado por ausência. O mecanismo antigo desativava na nuvem quem
 * não estava no aparelho, e um segundo aparelho com elenco diferente apagava
 * os links. Exclusão agora é marca (`deleted_at`), que viaja.
 *
 * Seguro de rodar a qualquer hora, inclusive ao abrir uma tela. Uma rodada
 * por vez: quem chama durante outra recebe a mesma.
 *
 * Devolve quantas pessoas novas chegaram (links e outros aparelhos).
 */
let rodada: Promise<number> | null = null;
export function syncAmador(groupId: string): Promise<number> {
  if (!rodada) {
    rodada = sincronizarAtletas(groupId).finally(() => {
      rodada = null;
    });
  }
  return rodada;
}

/** Hora das edições anteriores à base única: perdem para qualquer outra */
const LEGADO = new Date(0).toISOString();

async function sincronizarAtletas(groupId: string): Promise<number> {
  prepararLegado();
  await enviarAtletas(groupId);
  return receberAtletas(groupId);
}

/**
 * Jogadores de antes da base única não têm hora de edição. Os que já estão na
 * nuvem seguem a versão de lá — é a última que algum aparelho enviou —, e os
 * que nunca subiram são somados. Antes disso, uma cópia do elenco fica
 * guardada neste aparelho, para recuperação manual se algo sair errado.
 */
function prepararLegado() {
  const { players } = useAppStore.getState();
  if (!players.some((p) => !p.updatedAt)) return;
  try {
    if (!localStorage.getItem('timecerto:elenco-antes-da-nuvem')) {
      localStorage.setItem('timecerto:elenco-antes-da-nuvem', JSON.stringify(players));
    }
  } catch {
    /* sem espaço: segue sem a cópia */
  }
  const agora = new Date().toISOString();
  useAppStore.setState((s) => ({
    players: s.players.map((p) =>
      p.updatedAt
        ? p
        : p.remoteId
          ? { ...p, updatedAt: LEGADO, enviadoEm: LEGADO }
          : { ...p, updatedAt: agora },
    ),
  }));
}

const naoEnviado = (p: Player) => !p.remoteId || p.enviadoEm !== p.updatedAt;

async function enviarAtletas(groupId: string) {
  // O id da nuvem nasce aqui: um único upsert resolve novos e existentes
  useAppStore.setState((s) => ({
    players: s.players.map((p) => (p.remoteId ? p : { ...p, remoteId: crypto.randomUUID() })),
  }));
  const { players, excluidos } = useAppStore.getState();
  const vivos = players.filter(naoEnviado);
  if (vivos.length === 0 && excluidos.length === 0) return;

  const linha = (p: Player) => ({
    id: p.remoteId!,
    name: p.name,
    nickname: p.nickname ?? null,
    skills: p.skills,
    positions: p.positions,
    is_keeper: Boolean(p.isKeeper),
    kind: p.kind ?? 'mensalista',
    pending: Boolean(p.pending),
    birth_date: p.birthDate ?? null,
    phone: p.phone ?? null,
    deleted_at: null,
    updated_at: p.updatedAt,
  });
  const rows = [
    ...vivos.map(linha),
    ...excluidos.map((e) => ({ id: e.remoteId, name: e.name, deleted_at: e.at, updated_at: e.at })),
  ];
  const { error } = await db().rpc('salvar_jogadores', { p_group: groupId, p_rows: rows });
  if (error) throw error;

  // Só marca como enviado o que não mudou enquanto ia
  const enviado = new Map(vivos.map((p) => [p.id, p.updatedAt]));
  const exclusoesEnviadas = new Set(excluidos.map((e) => e.remoteId + e.at));
  useAppStore.setState((s) => ({
    players: s.players.map((p) =>
      enviado.get(p.id) === p.updatedAt ? { ...p, enviadoEm: p.updatedAt } : p,
    ),
    excluidos: s.excluidos.filter((e) => !exclusoesEnviadas.has(e.remoteId + e.at)),
  }));

  // Relê o que acabou de mandar. O servidor recusa em silêncio a edição mais
  // velha que a da nuvem, e a linha recusada não muda de hora de chegada — a
  // leitura por synced_at nunca a traria de volta, e este aparelho ficaria com
  // a versão velha, reenviando para sempre.
  const ids = vivos.map((p) => p.remoteId!);
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error: e2 } = await db()
      .from('players')
      .select(PLAYER_SYNC_COLS)
      .in('id', ids.slice(i, i + 100));
    if (e2) throw e2;
    mesclar((data ?? []) as unknown as LinhaJogador[]);
  }
}

const PLAYER_SYNC_COLS =
  'id, name, nickname, skills, positions, is_keeper, kind, pending, birth_date, phone, ' +
  'added_via_link, active, deleted_at, updated_at, synced_at, created_at';

interface LinhaJogador {
  id: string;
  name: string;
  nickname: string | null;
  skills: Player['skills'] | null;
  positions: Player['positions'] | null;
  is_keeper: boolean | null;
  kind: string | null;
  pending: boolean | null;
  birth_date: string | null;
  phone: string | null;
  added_via_link: boolean | null;
  active: boolean;
  deleted_at: string | null;
  updated_at: string;
  synced_at: string;
  created_at: string;
}

/** A linha da nuvem nos campos do jogador local (sem id local) */
const doJogador = (r: LinhaJogador) => ({
  name: r.name,
  nickname: r.nickname ?? undefined,
  skills: r.skills ?? {},
  positions: r.positions ?? {},
  isKeeper: Boolean(r.is_keeper) || undefined,
  kind: r.kind === 'convidado' ? ('convidado' as const) : ('mensalista' as const),
  pending: Boolean(r.pending),
  birthDate: r.birth_date ?? undefined,
  phone: r.phone ?? undefined,
  remoteId: r.id,
  updatedAt: r.updated_at,
  enviadoEm: r.updated_at,
});

/**
 * Traz o que mudou na nuvem desde a última leitura, pela hora de CHEGADA
 * (synced_at, carimbada pelo servidor). Regras da mescla:
 *
 * - marca de exclusão: tira daqui, a menos que haja edição local mais nova;
 * - inativo SEM marca de exclusão: foi o mecanismo antigo, que desativava por
 *   ausência — às vezes por engano. Não apaga nada aqui; se este aparelho tem
 *   a pessoa, ela é reenviada e volta aos links;
 * - quem não existe aqui: entra;
 * - quem existe: vale o mais recente. Edição local não enviada e mais nova fica.
 */
async function receberAtletas(groupId: string): Promise<number> {
  let novos = 0;
  for (;;) {
    const desde = useAppStore.getState().leituraNuvem ?? LEGADO;
    const { data, error } = await db()
      .from('players')
      .select(PLAYER_SYNC_COLS)
      .eq('group_id', groupId)
      .gt('synced_at', desde)
      .order('synced_at')
      .limit(500);
    if (error) throw error;
    const linhas = (data ?? []) as unknown as LinhaJogador[];
    if (linhas.length === 0) return novos;
    novos += mesclar(linhas);
    useAppStore.setState({ leituraNuvem: linhas[linhas.length - 1].synced_at });
    if (linhas.length < 500) return novos;
  }
}

/**
 * Aplica linhas da nuvem ao elenco deste aparelho — regras em receberAtletas.
 * Devolve quantas pessoas entraram.
 */
function mesclar(linhas: LinhaJogador[]): number {
  let novos = 0;
  if (linhas.length === 0) return novos;
  useAppStore.setState((s) => {
    const players = [...s.players];
    const esperandoExclusao = new Set(s.excluidos.map((e) => e.remoteId));
    for (const r of linhas) {
      if (esperandoExclusao.has(r.id)) continue;
      const i = players.findIndex((p) => p.remoteId === r.id);
      const local = i >= 0 ? players[i] : undefined;
      const localMaisNovo =
        local !== undefined && naoEnviado(local) && (local.updatedAt ?? LEGADO) >= r.updated_at;

      if (r.deleted_at) {
        if (local && !localMaisNovo) players.splice(i, 1);
        continue;
      }
      if (!r.active) {
        if (local) players[i] = { ...local, updatedAt: new Date().toISOString() };
        continue;
      }
      if (!local) {
        players.push({
          id: crypto.randomUUID(),
          createdAt: r.created_at,
          addedViaLink: Boolean(r.added_via_link),
          ...doJogador(r),
        });
        novos++;
      } else if (!localMaisNovo && local.updatedAt !== r.updated_at) {
        players[i] = { ...local, ...doJogador(r) };
      }
    }
    return { players };
  });
  return novos;
}

/**
 * Traz para o aparelho o que chegou pelos links e pelos outros aparelhos. É a
 * leitura da sincronização, sem o envio — para quem só quer ler.
 */
export async function pullLinkAdded(groupId: string): Promise<number> {
  prepararLegado();
  return receberAtletas(groupId);
}

/**
 * Sobe o elenco profissional e traz o que o atleta preencheu pelo link.
 * Nascimento, altura e peso: a nuvem vence quando tem valor — quem sabe a
 * própria altura é o atleta. O resto (nome, categoria, naipe, posição) é
 * decisão do técnico e vai do aparelho para a nuvem.
 */
export async function syncPro(groupId: string): Promise<void> {
  const { data: remote, error } = await db()
    .from('players')
    .select('id, birth_date, height_cm, weight_kg')
    .eq('group_id', groupId);
  if (error) throw error;
  const byId = new Map(remote.map((r) => [r.id, r]));

  const { players, updatePlayer } = useProStore.getState();
  const rows = players.map((p) => {
    const id = p.remoteId ?? crypto.randomUUID();
    const r = byId.get(id);
    const merged = {
      birthDate: r?.birth_date ?? p.birthDate,
      heightCm: r?.height_cm ?? p.heightCm,
      weightKg: r?.weight_kg != null ? Number(r.weight_kg) : p.weightKg,
    };
    updatePlayer(p.id, { remoteId: id, ...merged });
    return {
      id,
      group_id: groupId,
      name: p.name,
      positions: p.position ? { volei: p.position } : {},
      age_group: p.ageGroup,
      naipe: p.naipe,
      birth_date: merged.birthDate ?? null,
      height_cm: merged.heightCm ?? null,
      weight_kg: merged.weightKg ?? null,
      active: true,
    };
  });
  await upsertAndRetire(groupId, rows);

  // O token do link pessoal nasce no banco; traz para o aparelho
  const { data: tokens, error: e2 } = await db()
    .from('players')
    .select('id, invite_token')
    .eq('group_id', groupId);
  if (e2) throw e2;
  const tokenOf = new Map(tokens.map((t) => [t.id, t.invite_token as string]));
  for (const p of useProStore.getState().players) {
    const t = p.remoteId && tokenOf.get(p.remoteId);
    if (t && t !== p.inviteToken) updatePlayer(p.id, { inviteToken: t });
  }
}

/**
 * `protectFrom`: não aposenta quem foi criado a partir deste instante — é quem
 * se inscreveu pelo link enquanto a sincronização rodava.
 */
async function upsertAndRetire(groupId: string, rows: { id: string }[], protectFrom?: string) {
  if (rows.length > 0) {
    const { error } = await db().from('players').upsert(rows);
    if (error) throw error;
  }
  const keep = rows.map((r) => r.id);
  let q = db().from('players').update({ active: false }).eq('group_id', groupId);
  if (keep.length > 0) q = q.not('id', 'in', `(${keep.join(',')})`);
  if (protectFrom) q = q.lt('created_at', protectFrom);
  const { error } = await q;
  if (error) throw error;
}

// ── Jogo marcado e presença ─────────────────────────────────

export async function openEvent(groupId: string): Promise<CloudEvent | null> {
  const { data, error } = await db()
    .from('events')
    .select(EVENT_COLS)
    .eq('group_id', groupId)
    .eq('closed', false)
    .order('starts_at')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data && toEvent(data);
}

/** Marca o próximo jogo. O link mostra um jogo por vez: os abertos fecham. */
export async function createEvent(
  groupId: string,
  startsAt: Date,
  title: string,
  slots: number | null,
  location: string,
): Promise<CloudEvent> {
  const { error: e1 } = await db()
    .from('events')
    .update({ closed: true })
    .eq('group_id', groupId)
    .eq('closed', false);
  if (e1) throw e1;
  const { data, error } = await db()
    .from('events')
    .insert({
      group_id: groupId,
      starts_at: startsAt.toISOString(),
      title: title.trim() || null,
      slots,
      location: location.trim() || null,
    })
    .select(EVENT_COLS)
    .single();
  if (error) throw error;
  return toEvent(data);
}

/**
 * Põe o Jogo do aparelho nos links: sobe o elenco (o link precisa mostrar os
 * nomes de hoje) e cria o evento, que fecha o anterior. Quem chama liga o
 * `Jogo.remoteId` ao id devolvido.
 */
export async function publicarJogo(groupId: string, jogo: Jogo): Promise<CloudEvent> {
  await syncAmador(groupId);
  return createEvent(groupId, new Date(`${jogo.date}T${jogo.time}`), '', jogo.vagas, jogo.place);
}

/**
 * Leva as respostas do ORGANIZADOR para a nuvem, para o link mostrar quem ele
 * confirmou — e, principalmente, para o link saber que aquelas vagas já estão
 * ocupadas. Sem isto, quem entrava pelo link via vaga livre onde não havia e
 * furava a fila.
 *
 * `answered_at` vai com a hora do toque: é o que ordena a fila no link, e ela
 * tem de bater com o `seq` do aparelho. "Sem resposta" apaga a linha.
 */
export async function enviarRespostas(
  eventId: string,
  itens: { remoteId: string; status: ConfirmacaoStatus; at: string }[],
): Promise<void> {
  const gravar = itens
    .filter((i) => i.status !== 'sem-resposta')
    .map((i) => ({
      event_id: eventId,
      player_id: i.remoteId,
      status: i.status === 'confirmado' ? 'vou' : 'nao_vou',
      answered_at: i.at,
    }));
  if (gravar.length > 0) {
    const { error } = await db()
      .from('attendance')
      .upsert(gravar, { onConflict: 'event_id,player_id' });
    if (error) throw error;
  }
  const apagar = itens.filter((i) => i.status === 'sem-resposta').map((i) => i.remoteId);
  if (apagar.length > 0) {
    const { error } = await db()
      .from('attendance')
      .delete()
      .eq('event_id', eventId)
      .in('player_id', apagar);
    if (error) throw error;
  }
}

/**
 * Fecha ou reabre a lista. Fechada, o link para de aceitar resposta e a fila
 * congela — é o que deixa o sorteio publicado bater com a lista.
 *
 * Reabrir tira os times do link: com respostas mudando, eles deixariam de
 * valer, e time velho no link é pior que nenhum.
 */
export async function setListClosed(id: string, closed: boolean): Promise<void> {
  const patch = closed ? { list_closed: true } : { list_closed: false, teams: null };
  const { error } = await db().from('events').update(patch).eq('id', id);
  if (error) throw error;
}

/**
 * Publica o sorteio no link do jogo. Quem não tem id da nuvem fica de fora —
 * no fluxo pelos convites isso não acontece, porque só entra no sorteio quem
 * respondeu pelo link. Devolve quantos ficaram de fora, para a tela avisar.
 */
export async function publishTeams(eventId: string, result: DrawResult): Promise<number> {
  let semNuvem = 0;
  const ids = (list: { remoteId?: string }[]) =>
    list.flatMap((p) => {
      if (p.remoteId) return [p.remoteId];
      semNuvem++;
      return [];
    });
  const teams: PublishedTeams = {
    drawnAt: result.createdAt,
    teams: result.teams.map((t) => ({ name: t.name, color: t.color, players: ids(t.players) })),
    bench: ids(result.bench),
  };
  const { error } = await db().from('events').update({ teams }).eq('id', eventId);
  if (error) throw error;
  return semNuvem;
}

/** Respostas do jogo, por id da NUVEM do jogador */
export async function fetchAttendance(eventId: string): Promise<Attendance> {
  const { data, error } = await db()
    .from('attendance')
    .select('player_id, status, answered_at')
    .eq('event_id', eventId);
  if (error) throw error;
  return Object.fromEntries(
    data.map((a) => [a.player_id, { status: a.status, answeredAt: a.answered_at }]),
  );
}

// ── Links ───────────────────────────────────────────────────

function base(): string {
  return `${location.origin}${location.pathname}`;
}
/** Link dos mensalistas */
export const groupLink = (code: string) => `${base()}#/c/${code}`;
/** Link de convidados — se inscrevem na fila */
export const guestLink = (code: string) => `${base()}#/v/${code}`;
/** Link de cadastro de mensalistas — o pedido fica pendente até aprovar */
export const registerLink = (code: string) => `${base()}#/r/${code}`;
export const athleteLink = (token: string) => `${base()}#/a/${token}`;

/** Abre o WhatsApp com a mensagem pronta; a pessoa escolhe o contato ou grupo */
export function shareOnWhatsApp(text: string) {
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

// ── Convidado sem conta ─────────────────────────────────────

export interface GuestGroup {
  /** Por qual link a pessoa entrou */
  via: 'mensalistas' | 'convidados';
  group: { name: string; sport: string; mode: AppMode };
  event: CloudEvent | null;
  players: {
    id: string;
    name: string;
    kind: PlayerKind;
    position: string | null;
    status: 'vou' | 'nao_vou' | null;
    answeredAt: string | null;
    /** Nome de quem levou, quando a pessoa entrou como convidado */
    invitedBy: string | null;
  }[];
}

export async function guestRegisterInfo(code: string): Promise<{ name: string; sport: string }> {
  const { data, error } = await db().rpc('guest_register_info', { code });
  if (error) throw error;
  return data as { name: string; sport: string };
}

/** Pedido de cadastro do mensalista. Fica pendente até o administrador aprovar. */
export async function guestRegister(
  code: string,
  input: {
    name: string;
    nickname: string;
    birthDate: string;
    phone: string;
    position: string;
    level: number;
  },
): Promise<void> {
  const { error } = await db().rpc('guest_register', {
    code,
    p_name: input.name,
    p_birth: input.birthDate,
    p_phone: input.phone,
    p_position: input.position,
    p_level: input.level,
    p_nickname: input.nickname.trim() || null,
  });
  if (error) throw error;
}

/** O convidado se inscreve pelo link de convidados e entra na fila */
export async function guestJoin(
  code: string,
  eventId: string,
  name: string,
  position: string,
): Promise<string> {
  const { data, error } = await db().rpc('guest_join', {
    code,
    p_event: eventId,
    p_name: name,
    p_position: position,
  });
  if (error) throw error;
  return data as string;
}

/**
 * Inclui alguém que não está na lista e já confirma no jogo aberto.
 * `invitedBy` nulo = a pessoa se incluiu; preenchido = foi levada por alguém.
 * Devolve o id da pessoa nova. Erros do banco vêm em português e podem ir
 * direto para a tela.
 */
export async function guestAddPlayer(
  code: string,
  eventId: string,
  name: string,
  invitedBy: string | null,
  position: string,
): Promise<string> {
  const { data, error } = await db().rpc('guest_add_player', {
    code,
    p_event: eventId,
    p_name: name,
    p_invited_by: invitedBy,
    p_position: position,
  });
  if (error) throw error;
  return data as string;
}

export async function guestGroup(code: string): Promise<GuestGroup> {
  const { data, error } = await db().rpc('guest_group', { code });
  if (error) throw error;
  return data as GuestGroup;
}

export async function guestSetAttendance(
  code: string,
  eventId: string,
  playerId: string,
  status: 'vou' | 'nao_vou',
): Promise<void> {
  const { error } = await db().rpc('guest_set_attendance', {
    code,
    p_event: eventId,
    p_player: playerId,
    p_status: status,
  });
  if (error) throw error;
}

export interface GuestAthlete {
  group: { name: string };
  athlete: {
    id: string;
    name: string;
    birthDate: string | null;
    ageGroup: string | null;
    naipe: string | null;
    heightCm: number | null;
    weightKg: number | null;
    position: string | null;
  };
}

export async function guestAthlete(token: string): Promise<GuestAthlete> {
  const { data, error } = await db().rpc('guest_athlete', { token });
  if (error) throw error;
  return data as GuestAthlete;
}

export async function guestUpdateAthlete(
  token: string,
  birth: string | null,
  heightCm: number | null,
  weightKg: number | null,
): Promise<void> {
  const { error } = await db().rpc('guest_update_athlete', {
    token,
    p_birth: birth,
    p_height: heightCm,
    p_weight: weightKg,
  });
  if (error) throw error;
}
