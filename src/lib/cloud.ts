import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';
import { useProStore } from '@/store/useProStore';
import type { AppMode, DrawResult, PlayerKind, TeamColor } from '@/types';

/**
 * Tudo o que fala com o banco em nome do ORGANIZADOR (logado, sob RLS).
 * O convidado sem conta usa só as funções guest_* do fim do arquivo.
 *
 * O aparelho continua sendo a fonte de verdade do elenco: a nuvem recebe uma
 * cópia para que o link do WhatsApp tenha o que mostrar. Nada local é apagado
 * por causa da nuvem.
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

/** O grupo deste modo, se o organizador já criou — em qualquer aparelho */
export async function findMyGroup(mode: AppMode): Promise<CloudGroup | null> {
  const { data, error } = await db()
    .from('groups')
    .select(GROUP_COLS)
    .eq('owner_id', await uid())
    .eq('mode', mode)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data && toGroup(data);
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
 * Sobe o cadastro amador. O id da nuvem nasce no aparelho (randomUUID), então
 * um único upsert resolve novos e existentes sem ambiguidade de ordem.
 * Quem sumiu do aparelho fica inativo na nuvem — some do link, não do
 * histórico.
 */
export async function syncAmador(groupId: string): Promise<number> {
  // Quem se inscrever pelo link DEPOIS deste instante ainda não está no
  // aparelho, e não pode ser aposentado por isso
  const startedAt = new Date().toISOString();
  const added = await pullLinkAdded(groupId);
  const { players, updatePlayer } = useAppStore.getState();
  const rows = players.map((p) => {
    const id = p.remoteId ?? crypto.randomUUID();
    if (!p.remoteId) updatePlayer(p.id, { remoteId: id });
    return {
      id,
      group_id: groupId,
      name: p.name,
      skills: p.skills,
      positions: p.positions,
      is_keeper: Boolean(p.isKeeper),
      kind: p.kind ?? 'mensalista',
      pending: Boolean(p.pending),
      birth_date: p.birthDate ?? null,
      phone: p.phone ?? null,
      nickname: p.nickname ?? null,
      active: true,
    };
  });
  await upsertAndRetire(groupId, rows, startedAt);
  return added;
}

/**
 * Traz para o aparelho quem se incluiu pelo link (ou foi levado por alguém).
 * Precisa rodar ANTES do upsert: quem está na nuvem e não no aparelho é
 * aposentado pelo upsertAndRetire, e essas pessoas só existem na nuvem.
 * Devolve quantas chegaram agora.
 */
export async function pullLinkAdded(groupId: string): Promise<number> {
  const { data, error } = await db()
    .from('players')
    .select('id, name, nickname, skills, positions, kind, pending, birth_date, phone, created_at')
    .eq('group_id', groupId)
    .eq('active', true)
    .eq('added_via_link', true);
  if (error) throw error;

  const known = new Set(
    useAppStore.getState().players.map((p) => p.remoteId).filter(Boolean),
  );
  const novos = data.filter((r) => !known.has(r.id));
  if (novos.length === 0) return 0;

  useAppStore.setState((s) => ({
    players: [
      ...s.players,
      ...novos.map((r) => ({
        id: crypto.randomUUID(),
        name: r.name,
        skills: r.skills ?? {},
        positions: r.positions ?? {},
        // Entra ausente: quem decide a lista do sorteio é "Usar respostas"
        present: false,
        createdAt: r.created_at,
        remoteId: r.id,
        addedViaLink: true,
        kind: r.kind === 'mensalista' ? ('mensalista' as const) : ('convidado' as const),
        pending: Boolean(r.pending),
        birthDate: r.birth_date ?? undefined,
        phone: r.phone ?? undefined,
        nickname: r.nickname ?? undefined,
      })),
    ],
  }));
  return novos.length;
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
export async function guestJoin(code: string, eventId: string, name: string): Promise<string> {
  const { data, error } = await db().rpc('guest_join', { code, p_event: eventId, p_name: name });
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
): Promise<string> {
  const { data, error } = await db().rpc('guest_add_player', {
    code,
    p_event: eventId,
    p_name: name,
    p_invited_by: invitedBy,
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
