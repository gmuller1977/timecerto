import { lazy, Suspense, useMemo, useState } from 'react';
import { ChevronRight, Plus, Search, Send, X } from 'lucide-react';
import { PlayerSheet } from '@/components/players/PlayerSheet';
import { StarRating } from '@/components/ui/StarRating';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/store/useAppStore';
import { nomeDeExibicao } from '@/lib/nome';
import { SPORTS, getPositionLabel } from '@/lib/sports';
import { ageOn } from '@/lib/pro';
import { formatPhone } from '@/lib/phone';
import { candidatosParaJuntar, dadosDaJuncao, type Candidato } from '@/lib/juntar';
import { cn, initials } from '@/lib/utils';
import type { Player, PlayerKind, SkillLevel, SportId } from '@/types';

// Traz o Supabase junto: só carrega no primeiro toque em Convidar
const ConvidarSheet = lazy(() =>
  import('@/components/cloud/ConvidarSheet').then((m) => ({ default: m.ConvidarSheet })),
);

// Busca e filtro sobrevivem à troca de aba. Memória da sessão, como a rolagem da barra
let buscaGuardada = '';
type Filtro = 'todos' | 'mensalista' | 'convidado';
let filtroGuardado: Filtro = 'todos';

/**
 * Aba Atletas: quem é do grupo. Tela de manutenção, usada sentado — aqui cabe
 * formulário. Mensalistas e convidados em seções separadas, porque são
 * cadastros de natureza diferente: o mensalista tem vaga garantida, o
 * convidado joga quando sobra.
 *
 * A linha só mostra; editar é na ficha (PlayerSheet), que já tem tudo o que
 * a linha antiga editava — tipo, nível, posição e excluir.
 */
export function RosterPage() {
  const sport = useAppStore((s) => s.sport);
  const allPlayers = useAppStore((s) => s.players);
  // Pedidos pendentes ficam no bloco próprio, no topo, até a decisão
  const players = useMemo(() => allPlayers.filter((p) => !p.pending), [allPlayers]);
  const pendentes = useMemo(() => allPlayers.filter((p) => p.pending), [allPlayers]);
  const addPlayer = useAppStore((s) => s.addPlayer);
  const updatePlayer = useAppStore((s) => s.updatePlayer);
  const removePlayer = useAppStore((s) => s.removePlayer);
  const [convidando, setConvidando] = useState(false);
  /*
   * Aprovar, recusar e juntar são só locais: a sincronização (SincronizacaoNuvem,
   * em App.tsx) leva a decisão para a nuvem logo depois. Recusar e juntar deixam
   * a marca de exclusão do pedido (removePlayer), que viaja — por isso não
   * precisam mais de internet na hora, e o pedido não volta.
   */
  function approve(p: Player) {
    updatePlayer(p.id, { pending: false });
  }
  function reject(p: Player) {
    if (!window.confirm(`Recusar o cadastro de ${p.name}?`)) return;
    removePlayer(p.id);
  }
  function juntar(pedido: Player, alvo: Player) {
    const ok = window.confirm(
      `Juntar o pedido de ${pedido.name} ao cadastro de ${nomeDeExibicao(alvo)}?\n\n` +
        'Nascimento, telefone e apelido do pedido passam para o cadastro. Nível, posição e tipo continuam os seus.',
    );
    if (!ok) return;
    updatePlayer(alvo.id, dadosDaJuncao(alvo, pedido, sport));
    removePlayer(pedido.id);
  }

  const [name, setName] = useState('');
  const [skill, setSkill] = useState<SkillLevel>(3);
  const [position, setPosition] = useState('');
  const [kind, setKind] = useState<PlayerKind>('mensalista');
  const [query, setQueryState] = useState(buscaGuardada);
  const setQuery = (q: string) => {
    buscaGuardada = q;
    setQueryState(q);
  };
  const [filtro, setFiltroState] = useState<Filtro>(filtroGuardado);
  const setFiltro = (f: Filtro) => {
    filtroGuardado = f;
    setFiltroState(f);
  };
  const [editing, setEditing] = useState<Player | null>(null);
  // As contagens dos filtros são do grupo inteiro, não do resultado da busca
  const totalConvidados = players.filter((p) => p.kind === 'convidado').length;
  const totalMensalistas = players.length - totalConvidados;

  const { mensalistas, convidados } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (
      q
        ? players.filter(
            (p) =>
              p.name.toLowerCase().includes(q) || p.nickname?.toLowerCase().includes(q),
          )
        : players
    ).sort((a, b) => nomeDeExibicao(a).localeCompare(nomeDeExibicao(b), 'pt-BR'));
    return {
      mensalistas: list.filter((p) => p.kind !== 'convidado'),
      convidados: list.filter((p) => p.kind === 'convidado'),
    };
  }, [players, query]);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    // Permite colar vários nomes separados por vírgula ou quebra de linha
    const names = name
      .split(/[,\n]/)
      .map((n) => n.trim())
      .filter(Boolean);
    names.forEach((n) => addPlayer({ name: n, skill, position: position || undefined, kind }));
    setName('');
    setPosition('');
    setSkill(3);
  }

  const visiveis =
    (filtro !== 'convidado' ? mensalistas.length : 0) +
    (filtro !== 'mensalista' ? convidados.length : 0);

  // O jogador aberto na ficha, sempre na versão atual do store
  const aberto = editing && players.find((p) => p.id === editing.id);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-10">
      <header className="safe-top flex items-center justify-between gap-3 pt-6 pb-4">
        <h1 className="text-2xl font-bold tracking-tight">Atletas</h1>
        <button
          onClick={() => setConvidando(true)}
          className="flex items-center gap-1.5 rounded-lg border border-brand-500/40 bg-brand-500/10 px-3 py-2 text-xs font-medium text-brand-300"
        >
          <Send size={14} />
          Convidar
        </button>
      </header>

      <Pendentes
        players={pendentes}
        candidatos={(p) => candidatosParaJuntar(p, players)}
        onApprove={approve}
        onReject={reject}
        onJuntar={juntar}
      />

      <form onSubmit={handleAdd} className="rounded-2xl border border-ink-800 bg-ink-900 p-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome do jogador (ou cole vários, separados por vírgula)"
          className="w-full bg-transparent text-[15px] text-ink-50 placeholder:text-ink-500 outline-none"
        />
        <div className="mt-3 flex gap-1.5">
          {(['mensalista', 'convidado'] as PlayerKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn(
                'flex-1 rounded-lg border py-1.5 text-xs font-semibold',
                kind === k
                  ? 'border-brand-500 bg-brand-500/15 text-brand-300'
                  : 'border-ink-800 bg-ink-950 text-ink-400',
              )}
            >
              {k === 'mensalista' ? 'Mensalista' : 'Convidado'}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <StarRating value={skill} onChange={setSkill} size={17} />
            <select
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              className="rounded-lg bg-ink-800 px-2 py-1 text-xs text-ink-300 outline-none"
            >
              <option value="">Posição</option>
              {SPORTS[sport].positions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" size="sm" className="shrink-0" disabled={!name.trim()}>
            <Plus size={16} strokeWidth={2.5} />
            Adicionar
          </Button>
        </div>
      </form>

      {players.length > 0 && (
        <>
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-ink-800 bg-ink-900 px-3 py-2.5">
            <Search size={15} className="shrink-0 text-ink-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome ou apelido"
              aria-label="Buscar atleta"
              className="w-full bg-transparent text-sm outline-none placeholder:text-ink-500"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="shrink-0 p-0.5 text-ink-500"
                aria-label="Limpar busca"
              >
                <X size={15} />
              </button>
            )}
          </div>
          <div className="mt-2 flex gap-1.5" role="group" aria-label="Filtrar por tipo">
            {(
              [
                ['todos', 'Todos', totalMensalistas + totalConvidados],
                ['mensalista', 'Mensalistas', totalMensalistas],
                ['convidado', 'Convidados', totalConvidados],
              ] as const
            ).map(([id, label, n]) => (
              <button
                key={id}
                onClick={() => setFiltro(id)}
                aria-pressed={filtro === id}
                className={cn(
                  'h-9 flex-1 rounded-lg border text-xs font-semibold',
                  filtro === id
                    ? 'border-brand-500 bg-brand-500/15 text-brand-300'
                    : 'border-ink-800 bg-ink-950 text-ink-400',
                )}
              >
                {label} <span className="font-normal opacity-70">{n}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {filtro !== 'convidado' && (
        <Secao titulo="Mensalistas" players={mensalistas} onOpen={setEditing} />
      )}
      {filtro !== 'mensalista' && (
        <Secao titulo="Base de convidados" players={convidados} onOpen={setEditing} />
      )}
      {players.length > 0 && visiveis === 0 && (
        <p className="mt-6 text-center text-sm text-ink-500">
          {query.trim()
            ? `Ninguém com "${query.trim()}"${filtro !== 'todos' ? ' neste filtro' : ''}.`
            : filtro === 'convidado'
              ? 'Nenhum convidado na base ainda.'
              : 'Nenhum mensalista cadastrado ainda.'}
        </p>
      )}

      {players.length === 0 && (
        <div className="mt-10 text-center">
          <p className="text-5xl">{SPORTS[sport].emoji}</p>
          <p className="mt-3 text-sm text-ink-400">
            Adicione os jogadores da sua pelada
            <br />
            para sortear os times.
          </p>
        </div>
      )}

      {aberto && <PlayerSheet player={aberto} onClose={() => setEditing(null)} />}
      {convidando && (
        <Suspense fallback={null}>
          <ConvidarSheet onClose={() => setConvidando(false)} />
        </Suspense>
      )}
    </div>
  );
}

/**
 * Pedidos do link de cadastro, no topo de Atletas, com aprovar e recusar na
 * própria linha. Em âmbar, como pede docs/telas-amador.md: é o único bloco da
 * tela que espera uma decisão.
 *
 * Quando o pedido parece ser de alguém que já está em Atletas, a sugestão de
 * juntar vem ANTES de aprovar — aprovar ali criaria a mesma pessoa duas vezes.
 */
function Pendentes({
  players,
  candidatos,
  onApprove,
  onReject,
  onJuntar,
}: {
  players: Player[];
  candidatos: (p: Player) => Candidato[];
  onApprove: (p: Player) => void;
  onReject: (p: Player) => void;
  onJuntar: (pedido: Player, alvo: Player) => void;
}) {
  if (players.length === 0) return null;
  return (
    <section className="mb-4 rounded-2xl border border-amber-400/30 bg-amber-400/5 p-3">
      <p className="mb-2 text-[11px] font-semibold tracking-wide text-amber-300 uppercase">
        Aguardando aprovação ({players.length})
      </p>
      <div className="flex flex-col gap-2">
        {players.map((p) => {
          const age = p.birthDate ? ageOn(p.birthDate) : null;
          const sport = Object.keys(p.skills)[0] as SportId | undefined;
          const info = [
            sport && p.positions[sport] && getPositionLabel(sport, p.positions[sport]),
            age !== null && `${age} anos`,
            p.phone && formatPhone(p.phone),
          ].filter(Boolean);
          const level = (sport && p.skills[sport]) || 3;
          const parecidos = candidatos(p);
          return (
            <div key={p.id} className="rounded-xl border border-ink-800 bg-ink-950 p-3">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink-50">
                  {p.name}
                  {p.nickname && ` · ${p.nickname}`}
                </span>
                <StarRating value={level as SkillLevel} size={13} readOnly />
              </div>
              {info.length > 0 && (
                <p className="mt-0.5 truncate text-xs text-ink-400">{info.join(' · ')}</p>
              )}
              {parecidos.length > 0 && (
                <div className="mt-2.5">
                  <p className="text-xs leading-relaxed text-amber-200">
                    Parece ser alguém que já está em Atletas:
                  </p>
                  <div className="mt-1.5 flex flex-col gap-1.5">
                    {parecidos.map(({ player: alvo, motivo }) => (
                      <button
                        key={alvo.id}
                        onClick={() => onJuntar(p, alvo)}
                        className="flex min-h-10 items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-left"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-amber-100">
                          Juntar com {nomeDeExibicao(alvo)}
                          {alvo.nickname?.trim() && (
                            <span className="font-normal text-amber-200/70"> · {alvo.name}</span>
                          )}
                        </span>
                        <span className="shrink-0 text-[11px] text-amber-200/80">{motivo}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-2.5 flex gap-2">
                <button
                  onClick={() => onReject(p)}
                  className="h-10 rounded-lg border border-ink-700 px-3 text-sm text-ink-300"
                >
                  Recusar
                </button>
                <button
                  onClick={() => onApprove(p)}
                  className={cn(
                    'h-10 flex-1 rounded-lg text-sm font-semibold',
                    parecidos.length > 0
                      ? 'border border-ink-700 text-ink-200'
                      : 'bg-brand-500 text-ink-950',
                  )}
                >
                  {parecidos.length > 0 ? 'Aprovar como pessoa nova' : 'Aprovar'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
        O nível é o que a pessoa sugeriu. Depois de aprovar, ajuste na ficha — o sorteio usa
        o seu.
      </p>
    </section>
  );
}

function Secao({
  titulo,
  players,
  onOpen,
}: {
  titulo: string;
  players: Player[];
  onOpen: (p: Player) => void;
}) {
  if (players.length === 0) return null;
  return (
    <section className="mt-5">
      <p className="mb-2 text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
        {titulo} ({players.length})
      </p>
      <div className="flex flex-col gap-2">
        {players.map((p) => (
          <RosterRow key={p.id} player={p} onOpen={() => onOpen(p)} />
        ))}
      </div>
    </section>
  );
}

/** Nome, apelido, posição e nível. Um toque abre a ficha */
function RosterRow({ player, onOpen }: { player: Player; onOpen: () => void }) {
  const sport = useAppStore((s) => s.sport);
  const skill = (player.skills[sport] ?? 3) as SkillLevel;
  const position = player.positions[sport];
  const apelido = player.nickname?.trim();

  return (
    <button
      onClick={onOpen}
      className="flex items-center gap-3 rounded-2xl border border-ink-800 bg-ink-900 px-3 py-2.5 text-left active:scale-[0.99]"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink-800 text-sm font-bold text-ink-400">
        {initials(player.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-ink-50">
          {nomeDeExibicao(player)}
          {apelido && <span className="font-normal text-ink-500"> · {player.name}</span>}
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          <StarRating value={skill} size={13} readOnly />
          <span className="truncate text-[11px] text-ink-500">
            {position ? getPositionLabel(sport, position) : 'Sem posição'}
          </span>
        </span>
      </span>
      <ChevronRight size={17} className="shrink-0 text-ink-600" />
    </button>
  );
}
