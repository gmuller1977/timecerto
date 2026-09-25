import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarPlus, ChevronDown, ChevronRight, History, MapPin, Radio, Swords, X } from 'lucide-react';
import { useMatchStore } from '@/store/useMatchStore';
import { useAppStore } from '@/store/useAppStore';
import { useJogoStore } from '@/store/useJogoStore';
import { FormJogo } from '@/components/jogo/FormJogo';
import { SeloStatus } from '@/components/jogo/SeloStatus';
import { Button } from '@/components/ui/Button';
import {
  inicioDo,
  JANELA_PROXIMO_MS,
  proximoJogo,
  ROTULO_STATUS,
  statusDoJogo,
  type StatusDoJogo,
} from '@/lib/jogo';
import { SPORTS, SPORT_LIST } from '@/lib/sports';
import { vagasDoJogo } from '@/lib/vagas';
import { cn } from '@/lib/utils';
import type { Jogo, Player, SportId } from '@/types';

const fmtDia = (j: Jogo) =>
  new Date(`${j.date}T${j.time}`).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
  });

const ORDEM_STATUS: StatusDoJogo[] = [
  'recebendo',
  'lista_fechada',
  'em_jogo',
  'agendado',
  'sem_encerrar',
  'encerrado',
  'cancelado',
];

interface Filtros {
  sport: SportId | null;
  /** YYYY-MM-DD */
  dia: string;
  status: StatusDoJogo | null;
}
// Os filtros sobrevivem a abrir um jogo e voltar. Memória da sessão
let filtrosGuardados: Filtros = { sport: null, dia: '', status: null };

/**
 * Aba Jogo: todos os jogos marcados (pedido do Guilherme em 24/09/2026). Os
 * próximos em ordem de data; os anteriores recolhidos. Tocar num jogo abre a
 * página dele — confirmados, times, partidas e estatística.
 *
 * O esporte é escolhido em cada jogo (migração 014), e não mais num seletor
 * no topo: o cartão mostra a modalidade, e ela é um dos filtros.
 */
export function JogosPage() {
  const navigate = useNavigate();
  const jogos = useJogoStore((s) => s.jogos);
  // Antes da migração do antigo `present`, "sem jogo" não quer dizer nada
  const migrado = useJogoStore((s) => Boolean(s.migracoes.present));
  const players = useAppStore((s) => s.players);
  const live = useMatchStore((s) => s.live);
  const matchCount = useMatchStore((s) => s.matches.filter((m) => m.mode !== 'profissional').length);
  const [criando, setCriando] = useState(false);
  const [verAnteriores, setVerAnteriores] = useState(false);
  const [filtros, setFiltrosState] = useState(filtrosGuardados);
  const setFiltros = (f: Partial<Filtros>) => {
    filtrosGuardados = { ...filtros, ...f };
    setFiltrosState(filtrosGuardados);
  };
  // O instante de abrir a tela: basta para separar próximos de anteriores
  const [agora] = useState(() => Date.now());

  const filtrando = Boolean(filtros.sport || filtros.dia || filtros.status);

  const { proximos, anteriores, proximo, statusDe } = useMemo(() => {
    const prox = proximoJogo(jogos, agora);
    const ctx = { proximoId: prox?.id ?? null, jogoAoVivo: live?.jogoId ?? null, agora };
    const statusDe = new Map(jogos.map((j) => [j.id, statusDoJogo(j, ctx)]));
    const passa = (j: Jogo) =>
      (!filtros.sport || j.sport === filtros.sport) &&
      (!filtros.dia || j.date === filtros.dia) &&
      (!filtros.status || statusDe.get(j.id) === filtros.status);
    const vivo = (j: Jogo) => j.status === 'aberto' && inicioDo(j) >= agora - JANELA_PROXIMO_MS;
    const lista = jogos.filter(passa);
    return {
      proximos: lista.filter(vivo).sort((a, b) => inicioDo(a) - inicioDo(b)),
      anteriores: lista.filter((j) => !vivo(j)).sort((a, b) => inicioDo(b) - inicioDo(a)),
      proximo: prox,
      statusDe,
    };
  }, [jogos, agora, live?.jogoId, filtros]);

  const ativos = useMemo(() => players.filter((p) => !p.pending), [players]);
  // Filtrando, o que achou aparece inteiro: esconder anteriores esconderia o resultado
  const mostraAnteriores = verAnteriores || filtrando;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-10">
      <header className="safe-top flex items-center justify-between gap-3 pt-6 pb-4">
        <h1 className="text-2xl font-bold tracking-tight">Jogo</h1>
        <button
          onClick={() => navigate('/historico')}
          className="flex items-center gap-1.5 rounded-lg border border-ink-800 bg-ink-900 px-3 py-2 text-xs font-medium text-ink-300"
          aria-label="Partidas"
        >
          <History size={14} />
          Partidas
          {matchCount > 0 && <span className="text-ink-500">{matchCount}</span>}
        </button>
      </header>

      {live && (
        <button
          onClick={() => navigate('/placar')}
          className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-brand-500/40 bg-brand-500/10 px-4 py-3 text-left"
        >
          <Radio size={18} className="shrink-0 animate-pulse text-brand-400" />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-brand-200">Partida em andamento</span>
            <span className="block truncate text-xs text-brand-300/70">
              {live.teams[0].name} {live.sets[live.sets.length - 1].scoreA} ×{' '}
              {live.sets[live.sets.length - 1].scoreB} {live.teams[1].name} · {live.sets.length}º set
            </span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-brand-400" />
        </button>
      )}

      {/* A ação principal da aba, acima dos jogos */}
      {criando ? (
        <section className="rounded-2xl border border-ink-800 bg-ink-900 p-4">
          <p className="mb-3 text-[15px] font-semibold text-ink-50">Novo jogo</p>
          <FormJogo
            onCancel={() => setCriando(false)}
            onDone={(j) => {
              setCriando(false);
              navigate(`/jogo/${j.id}`);
            }}
          />
        </section>
      ) : (
        <div className="flex gap-2">
          <Button size="lg" className="flex-1" onClick={() => setCriando(true)}>
            <CalendarPlus size={19} />
            Novo jogo
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="shrink-0 px-4"
            onClick={() => navigate('/partida')}
            aria-label="Partida direta, sem jogo marcado"
          >
            <Swords size={18} />
            Partida direta
          </Button>
        </div>
      )}

      {migrado && jogos.length > 0 && (
        <FiltroBar filtros={filtros} setFiltros={setFiltros} filtrando={filtrando} />
      )}

      {migrado && (
        <>
          <section className="mt-5">
            <p className="mb-2 text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
              Próximos jogos ({proximos.length})
            </p>
            <div className="flex flex-col gap-2">
              {proximos.map((j) => (
                <CartaoJogo
                  key={j.id}
                  jogo={j}
                  players={ativos}
                  status={statusDe.get(j.id)!}
                  destaque={j.id === proximo?.id}
                  onOpen={() => navigate(`/jogo/${j.id}`)}
                />
              ))}
              {proximos.length === 0 && (
                <p className="rounded-2xl border border-dashed border-ink-800 px-4 py-5 text-center text-sm text-ink-400">
                  {filtrando
                    ? 'Nenhum jogo próximo com esses filtros.'
                    : 'Nenhum jogo marcado. Crie o próximo para marcar quem vem e sortear.'}
                </p>
              )}
            </div>
          </section>

          {anteriores.length > 0 && (
            <section className="mt-6">
              <button
                onClick={() => setVerAnteriores((v) => !v)}
                disabled={filtrando}
                className="flex w-full items-center gap-1.5 text-[11px] font-semibold tracking-wide text-ink-500 uppercase"
                aria-expanded={mostraAnteriores}
              >
                {!filtrando && (
                  <ChevronDown size={14} className={cn('transition-transform', mostraAnteriores && 'rotate-180')} />
                )}
                Anteriores ({anteriores.length})
              </button>
              {mostraAnteriores && (
                <div className="mt-2 flex flex-col gap-2">
                  {anteriores.map((j) => (
                    <CartaoJogo
                      key={j.id}
                      jogo={j}
                      players={ativos}
                      status={statusDe.get(j.id)!}
                      onOpen={() => navigate(`/jogo/${j.id}`)}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function FiltroBar({
  filtros,
  setFiltros,
  filtrando,
}: {
  filtros: Filtros;
  setFiltros: (f: Partial<Filtros>) => void;
  filtrando: boolean;
}) {
  const chip = (ativo: boolean) =>
    cn(
      'h-9 shrink-0 rounded-lg border px-3 text-xs font-semibold',
      ativo ? 'border-brand-500 bg-brand-500/15 text-brand-300' : 'border-ink-800 bg-ink-950 text-ink-400',
    );
  const campo =
    'h-10 w-full rounded-lg border border-ink-800 bg-ink-950 px-2.5 text-xs text-ink-200 outline-none [color-scheme:dark]';
  return (
    <section className="mt-5" aria-label="Filtros">
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
        <button className={chip(!filtros.sport)} onClick={() => setFiltros({ sport: null })}>
          Todas
        </button>
        {SPORT_LIST.map((s) => (
          <button
            key={s.id}
            className={chip(filtros.sport === s.id)}
            aria-pressed={filtros.sport === s.id}
            onClick={() => setFiltros({ sport: filtros.sport === s.id ? null : s.id })}
          >
            {s.emoji} {s.name}
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Dia</span>
          <input
            type="date"
            value={filtros.dia}
            onChange={(e) => setFiltros({ dia: e.target.value })}
            aria-label="Filtrar por dia"
            className={cn(campo, !filtros.dia && 'text-ink-500')}
          />
        </label>
        <label className="min-w-0 flex-1">
          <span className="sr-only">Status</span>
          <select
            value={filtros.status ?? ''}
            onChange={(e) => setFiltros({ status: (e.target.value || null) as StatusDoJogo | null })}
            aria-label="Filtrar por status"
            className={cn(campo, !filtros.status && 'text-ink-500')}
          >
            <option value="">Todos os status</option>
            {ORDEM_STATUS.map((s) => (
              <option key={s} value={s}>
                {ROTULO_STATUS[s]}
              </option>
            ))}
          </select>
        </label>
        {filtrando && (
          <button
            onClick={() => setFiltros({ sport: null, dia: '', status: null })}
            className="flex h-10 shrink-0 items-center gap-1 rounded-lg border border-ink-800 px-2.5 text-xs text-ink-300"
            aria-label="Limpar filtros"
          >
            <X size={14} />
            Limpar
          </button>
        )}
      </div>
    </section>
  );
}

function CartaoJogo({
  jogo,
  players,
  status,
  destaque = false,
  onOpen,
}: {
  jogo: Jogo;
  players: Player[];
  status: StatusDoJogo;
  /** O jogo que está nos links */
  destaque?: boolean;
  onOpen: () => void;
}) {
  const dist = vagasDoJogo(jogo, players);
  const jogam = dist.mensalistasConfirmados + dist.convidadosComVaga;
  const esporte = SPORTS[jogo.sport];
  return (
    <button
      onClick={onOpen}
      className={cn(
        'flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left active:scale-[0.99]',
        destaque ? 'border-brand-500/40 bg-ink-900' : 'border-ink-800 bg-ink-900',
      )}
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-ink-800" aria-hidden>
        <span className="text-xl leading-none">{esporte.emoji}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold capitalize text-ink-50">
          {fmtDia(jogo)} · {jogo.time}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-400">
          <span className="shrink-0 font-medium text-ink-300">{esporte.name}</span>
          {jogo.place && (
            <>
              <span className="text-ink-600">·</span>
              <MapPin size={12} className="shrink-0 text-ink-500" />
              <span className="truncate">{jogo.place}</span>
            </>
          )}
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-400">
          <SeloStatus status={status} />
          <span>
            <strong className="text-ink-200">{jogam}</strong> {jogam === 1 ? 'confirmado' : 'confirmados'}
            {jogo.vagas != null && ` de ${jogo.vagas}`}
            {dist.naFila > 0 && ` · ${dist.naFila} na fila`}
            {jogo.sorteio && ' · times sorteados'}
          </span>
        </span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-ink-600" />
    </button>
  );
}
