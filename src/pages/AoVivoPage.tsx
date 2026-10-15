import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Copy, Flag, Radio, Send, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ScoutDaPartida } from '@/components/scout/ScoutDaPartida';
import { TEAM_COLOR_CLASSES } from '@/lib/draw';
import { ACTION_LABEL } from '@/lib/volley';
import { hasDetail } from '@/lib/volleyStats';
import { copyToClipboard, shareOnWhatsApp } from '@/lib/share';
import { partidaEncerrada } from '@/store/useMatchStore';
import {
  encerrarPartidaAoVivo,
  liberarLinkDeScout,
  linkDoScout,
  partidaAoVivo,
  type PartidaAoVivo,
} from '@/lib/cloud';
import type { Match } from '@/types';
import { cn } from '@/lib/utils';

/**
 * Acompanhamento da partida marcada pelo link (migração 041). Qualquer
 * administrador do grupo vê o placar e o scout se atualizando, reenvia o
 * link, libera o link para outro celular ou encerra no lugar de quem marca.
 * Lê a nuvem a cada 3 s — sem assinatura em tempo real, de propósito: é uma
 * leitura simples que não pesa em quem está marcando.
 */
export function AoVivoPage() {
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const [p, setP] = useState<PartidaAoVivo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const encerrada = Boolean(p?.encerradaEm);
  useEffect(() => {
    if (encerrada) return;
    let vivo = true;
    const ler = () => {
      if (document.visibilityState !== 'visible') return;
      partidaAoVivo(id)
        .then((r) => {
          if (!vivo) return;
          if (!r) setErro('Partida não encontrada. Ela pode ser de outro grupo.');
          else {
            setP(r);
            setErro(null);
          }
        })
        .catch((e) => {
          console.warn('partida ao vivo', e);
          if (vivo) setErro(navigator.onLine ? 'Não deu para ler a partida agora.' : 'Sem internet.');
        });
    };
    ler();
    const t = setInterval(ler, 3_000);
    document.addEventListener('visibilitychange', ler);
    return () => {
      vivo = false;
      clearInterval(t);
      document.removeEventListener('visibilitychange', ler);
    };
  }, [id, encerrada]);

  const voltar = () => navigate('/historico');

  if (!p) {
    return (
      <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-10">
        <header className="safe-top flex items-center gap-3 pt-6 pb-4">
          <button onClick={voltar} className="p-1 text-ink-400">
            <ArrowLeft size={22} />
          </button>
          <h1 className="text-xl font-bold">Ao vivo</h1>
        </header>
        <p className="text-sm text-ink-400">{erro ?? 'Abrindo a partida…'}</p>
      </div>
    );
  }

  const live = p.estado;
  const [teamA, teamB] = live.teams;
  const current = live.sets[live.sets.length - 1];
  const rallies = current.rallies ?? [];
  const nomeDe = (pid?: string) => (pid ? p.elenco.find((x) => x.id === pid)?.name.split(' ')[0] : undefined);
  const setsWon = live.teams.map(
    (t) =>
      live.sets.filter(
        (g) => g.finished && ((g.teamAId === t.id && g.scoreA > g.scoreB) || (g.teamBId === t.id && g.scoreB > g.scoreA)),
      ).length,
  );
  // O scout da partida até aqui, nos mesmos gráficos do resumo
  const comoPartida: Match = {
    id: p.id,
    date: live.date,
    sport: live.sport,
    teams: live.teams,
    games: live.sets.filter((g) => (g.rallies?.length ?? 0) > 0),
    scorers: {},
    attendance: [],
    mode: live.pro ? 'profissional' : 'amador',
  };
  const url = linkDoScout(p.token);
  const textoDoLink = `Marque o placar e o scout da partida ${teamA.name} × ${teamB.name} por este link:\n${url}`;

  async function liberar() {
    if (!confirm('Liberar o link? O celular que está marcando para de enviar, e o próximo que abrir passa a marcar.')) return;
    setOcupado(true);
    try {
      await liberarLinkDeScout(p!.id);
      setP({ ...p!, emUso: false });
    } catch (e) {
      console.error('liberar o link', e);
      alert('Não deu para liberar agora. Tente de novo.');
    } finally {
      setOcupado(false);
    }
  }

  async function encerrar() {
    if (!confirm('Encerrar a partida agora? Ela vai para o histórico com os pontos marcados até aqui, e o link passa a mostrar "jogo encerrado".')) return;
    setOcupado(true);
    try {
      await encerrarPartidaAoVivo(p!.id, partidaEncerrada(p!.estado));
      setP({ ...p!, encerradaEm: new Date().toISOString() });
    } catch (e) {
      console.error('encerrar a partida ao vivo', e);
      alert('Não deu para encerrar agora. Tente de novo.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-10">
      <header className="safe-top flex items-center gap-3 pt-6 pb-4">
        <button onClick={voltar} className="p-1 text-ink-400">
          <ArrowLeft size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-xl font-bold">
            {encerrada ? (
              'Partida encerrada'
            ) : (
              <>
                <Radio size={18} className="animate-pulse text-brand-400" />
                Ao vivo
              </>
            )}
          </h1>
          <p className="text-xs text-ink-400">
            {encerrada
              ? 'Ela entra no histórico na próxima sincronização'
              : p.emUso
                ? 'Um celular está marcando pelo link'
                : 'Ninguém abriu o link ainda'}
          </p>
        </div>
      </header>

      {erro && <p className="mb-3 text-xs text-amber-300">{erro} Mostrando a última leitura.</p>}

      {/* Placar */}
      <section className="rounded-2xl border border-ink-800 bg-ink-900 p-4">
        <p className="text-center text-xs font-semibold tracking-wide text-ink-400 uppercase">
          {live.sets.length}º set · {setsWon[0]} — {setsWon[1]} em sets
        </p>
        <div className="mt-2 flex items-start justify-between">
          {[
            { t: teamA, score: current.scoreA },
            { t: teamB, score: current.scoreB },
          ].map(({ t, score }) => (
            <div key={t.id} className="flex-1 text-center">
              <span className={cn('mx-auto mb-1 block size-2.5 rounded-full', TEAM_COLOR_CLASSES[t.color].bg)} />
              <p className="line-clamp-2 min-h-10 px-1 text-sm font-semibold text-ink-200">{t.name}</p>
              <p className="mt-1 text-6xl font-bold tabular-nums text-ink-50">{score}</p>
            </div>
          ))}
        </div>
        {live.sets.length > 1 && (
          <div className="mt-4 flex flex-wrap justify-center gap-2 border-t border-ink-800 pt-3">
            {live.sets.slice(0, -1).map((g, i) => (
              <span key={g.id} className="rounded-lg bg-ink-800 px-2.5 py-1 text-xs tabular-nums text-ink-300">
                {i + 1}º {g.scoreA}–{g.scoreB}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Últimos pontos */}
      {rallies.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[...rallies]
            .reverse()
            .slice(0, 12)
            .map((r) => {
              const team = live.teams.find((t) => t.id === r.teamId);
              const quem = nomeDe(r.playerId);
              return (
                <span
                  key={r.id}
                  className="flex items-center gap-1.5 rounded-lg border border-ink-800 bg-ink-900 px-2 py-1"
                >
                  <span className={cn('size-1.5 rounded-full', team && TEAM_COLOR_CLASSES[team.color].bg)} />
                  <span className="text-[11px] tabular-nums text-ink-400">
                    {r.scoreA}-{r.scoreB}
                  </span>
                  {r.action !== 'indefinido' && (
                    <span className={cn('text-[11px]', r.kind === 'ponto' ? 'text-brand-300' : 'text-ink-500')}>
                      {r.kind === 'erro' ? 'erro ' : ''}
                      {ACTION_LABEL[r.action].toLowerCase()}
                    </span>
                  )}
                  {quem && <span className="text-[11px] text-ink-300">{quem}</span>}
                </span>
              );
            })}
        </div>
      )}

      {/* O link */}
      {!encerrada && (
        <section className="mt-4 rounded-2xl border border-ink-800 bg-ink-900 p-4">
          <p className="text-sm font-semibold text-ink-100">Link de quem marca</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-500">
            Quem abrir marca os pontos, sem ser administrador. Só um celular por vez.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button size="sm" onClick={() => shareOnWhatsApp(textoDoLink)}>
              <Send size={15} />
              WhatsApp
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                if (await copyToClipboard(url)) {
                  setCopiado(true);
                  setTimeout(() => setCopiado(false), 2000);
                }
              }}
            >
              {copiado ? <Check size={15} /> : <Copy size={15} />}
              {copiado ? 'Copiado' : 'Copiar'}
            </Button>
            {p.emUso && (
              <Button size="sm" variant="secondary" className="col-span-2" onClick={liberar} disabled={ocupado}>
                <Unlock size={15} />
                Liberar para outro celular
              </Button>
            )}
            <Button size="sm" variant="danger" className="col-span-2" onClick={encerrar} disabled={ocupado}>
              <Flag size={15} />
              Encerrar a partida
            </Button>
          </div>
        </section>
      )}

      {hasDetail(comoPartida) && (
        <div className="mt-1">
          <ScoutDaPartida match={comoPartida} players={p.elenco} />
        </div>
      )}

      {encerrada && (
        <button onClick={voltar} className="mt-6 self-center text-sm font-medium text-brand-400">
          Ver todas as partidas
        </button>
      )}
    </div>
  );
}
