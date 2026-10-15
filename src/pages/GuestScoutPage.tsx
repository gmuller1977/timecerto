import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CloudOff, Flag, Lock } from 'lucide-react';
import { Frame } from '@/pages/GuestGroupPage';
import { ScoreboardPage } from '@/pages/ScoreboardPage';
import { PlacarProvider, type Placar } from '@/components/scout/PlacarContexto';
import { criarStoreDePartida, partidaEncerrada, type LiveMatch } from '@/store/useMatchStore';
import { guestScoutAbrir, guestScoutEncerrar, guestScoutSalvar, type GravacaoDoScout } from '@/lib/cloud';
import type { Player } from '@/types';

/**
 * O store do link: chave própria, longe da partida do aparelho. Quem marca
 * pelo link pode ser administrador de outro grupo no mesmo celular — a
 * partida dele não pode ser tocada.
 */
const useScoutDoLink = criarStoreDePartida('timecerto:scout-link');
const CHAVE_TOKEN = 'timecerto:scout-link-token';
// O elenco que veio com o link: sem sinal, o placar ainda acha os nomes
const CHAVE_ELENCO = 'timecerto:scout-link-elenco';

function lerElenco(): Player[] {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_ELENCO) ?? '[]') as Player[];
  } catch {
    return [];
  }
}
function gravarElenco(e: Player[]) {
  try {
    localStorage.setItem(CHAVE_ELENCO, JSON.stringify(e));
  } catch {
    /* sem armazenamento */
  }
}

function lerToken(): string | null {
  try {
    return localStorage.getItem(CHAVE_TOKEN);
  } catch {
    return null;
  }
}
function gravarToken(t: string | null) {
  try {
    if (t) localStorage.setItem(CHAVE_TOKEN, t);
    else localStorage.removeItem(CHAVE_TOKEN);
  } catch {
    /* sem armazenamento: o placar segue na memória */
  }
}

type Tela =
  | { tipo: 'carregando' }
  | { tipo: 'invalido'; texto: string }
  | { tipo: 'em_uso'; grupo: string }
  | { tipo: 'encerrada'; grupo: string; estado: LiveMatch }
  | { tipo: 'marcando'; grupo: string; elenco: Player[] };

/**
 * Scout pelo link (migração 041, pedido do Guilherme em 15/10/2026). Quem não
 * é administrador marca a partida aqui: o mesmo placar do app, sem descartar
 * nem mudar a configuração. Cada mudança sobe para a nuvem, onde os
 * administradores acompanham; sem sinal, o placar segue e sobe quando a rede
 * volta — o ponto nunca espera a internet.
 */
export function GuestScoutPage() {
  const { token = '' } = useParams();
  const [tela, setTela] = useState<Tela>({ tipo: 'carregando' });
  const [pendente, setPendente] = useState(false);
  const [encerrando, setEncerrando] = useState(false);

  useEffect(() => {
    let vivo = true;
    guestScoutAbrir(token)
      .then((r) => {
        if (!vivo) return;
        if (r.situacao === 'em_uso') return setTela({ tipo: 'em_uso', grupo: r.grupo });
        if (r.situacao === 'encerrada') {
          if (lerToken() === token) {
            useScoutDoLink.setState({ live: null });
            gravarToken(null);
          }
          return setTela({ tipo: 'encerrada', grupo: r.grupo, estado: r.estado });
        }
        // Só este aparelho marca este link: a cópia daqui nunca está atrás da
        // nuvem. Outro link, ou nenhum, começa do que está na nuvem
        const local = useScoutDoLink.getState().live;
        if (lerToken() !== token || !local) {
          useScoutDoLink.setState({ live: r.estado, matches: [], excluidas: [] });
          gravarToken(token);
        }
        gravarElenco(r.elenco);
        setTela({ tipo: 'marcando', grupo: r.grupo, elenco: r.elenco });
      })
      .catch((e) => {
        console.error('abrir o link do scout', e);
        if (!vivo) return;
        // Sem sinal, quem já estava marcando continua
        if (!navigator.onLine && lerToken() === token && useScoutDoLink.getState().live) {
          setTela({ tipo: 'marcando', grupo: '', elenco: lerElenco() });
          return;
        }
        setTela({
          tipo: 'invalido',
          texto: navigator.onLine
            ? 'Este link não é válido. Peça um novo a quem organizou o jogo.'
            : 'Sem internet. Conecte e abra o link de novo.',
        });
      });
    return () => {
      vivo = false;
    };
  }, [token]);

  // Sobe cada mudança, 800 ms depois do último toque. Falhou a rede, tenta de
  // novo na próxima mudança, quando a internet volta e a cada 15 s
  const enviando = useRef(false);
  const deNovo = useRef(false);
  const marcando = tela.tipo === 'marcando';
  useEffect(() => {
    if (!marcando) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ultimo: LiveMatch | null = null;

    const tratar = (r: GravacaoDoScout) => {
      if (r === 'em_uso') setTela({ tipo: 'em_uso', grupo: '' });
      if (r === 'encerrada') {
        const estado = useScoutDoLink.getState().live;
        useScoutDoLink.setState({ live: null });
        gravarToken(null);
        if (estado) setTela({ tipo: 'encerrada', grupo: '', estado });
      }
    };
    const enviar = async () => {
      const live = useScoutDoLink.getState().live;
      if (!live || live === ultimo) return setPendente(false);
      if (enviando.current) {
        deNovo.current = true;
        return;
      }
      enviando.current = true;
      try {
        const r = await guestScoutSalvar(token, live);
        ultimo = live;
        setPendente(useScoutDoLink.getState().live !== live);
        tratar(r);
      } catch (e) {
        console.warn('enviar o scout', e);
        setPendente(true);
      } finally {
        enviando.current = false;
        if (deNovo.current) {
          deNovo.current = false;
          void enviar();
        }
      }
    };
    const agendar = () => {
      setPendente(true);
      clearTimeout(timer);
      timer = setTimeout(enviar, 800);
    };
    const off = useScoutDoLink.subscribe((s, antes) => {
      if (s.live && s.live !== antes.live) agendar();
    });
    const intervalo = setInterval(enviar, 15_000);
    window.addEventListener('online', enviar);
    return () => {
      off();
      clearTimeout(timer);
      clearInterval(intervalo);
      window.removeEventListener('online', enviar);
    };
  }, [marcando, token]);

  const placar: Placar | null = useMemo(
    () =>
      tela.tipo === 'marcando'
        ? {
            useStore: useScoutDoLink,
            players: tela.elenco,
            link: { aoEncerrar: () => setEncerrando(true) },
          }
        : null,
    [tela],
  );

  async function encerrar() {
    const live = useScoutDoLink.getState().live;
    if (!live) return;
    if (!navigator.onLine) {
      alert('Sem internet. Conecte e encerre de novo: os pontos continuam salvos neste celular.');
      return;
    }
    try {
      const r = await guestScoutEncerrar(token, live, partidaEncerrada(live));
      if (r === 'em_uso') return setTela({ tipo: 'em_uso', grupo: '' });
      useScoutDoLink.setState({ live: null });
      gravarToken(null);
      setEncerrando(false);
      setTela({ tipo: 'encerrada', grupo: '', estado: live });
    } catch (e) {
      console.error('encerrar pelo link', e);
      alert('Não deu para encerrar agora. Os pontos continuam salvos neste celular; tente de novo.');
    }
  }

  if (tela.tipo === 'marcando' && placar) {
    return (
      <PlacarProvider value={placar}>
        <ScoreboardPage />
        {pendente && !navigator.onLine && (
          <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center pt-1">
            <span className="flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
              <CloudOff size={11} />
              Sem internet: os pontos sobem quando voltar
            </span>
          </div>
        )}
        {encerrando && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end">
            <div className="absolute inset-0 bg-black/70" onClick={() => setEncerrando(false)} />
            <div className="safe-bottom relative rounded-t-3xl border-t border-ink-700 bg-ink-900 px-4 pt-4 pb-6">
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink-700" />
              <p className="text-[15px] font-semibold text-ink-50">Encerrar a partida?</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-300">
                A partida vai para o histórico do grupo e o link passa a mostrar "jogo encerrado". Não dá
                para marcar mais nada depois.
              </p>
              <div className="mt-5 flex gap-2">
                <button
                  onClick={() => setEncerrando(false)}
                  className="h-12 flex-1 rounded-xl border border-ink-700 text-sm font-medium text-ink-200"
                >
                  Continuar marcando
                </button>
                <button
                  onClick={encerrar}
                  className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-500 font-semibold text-ink-950"
                >
                  <Flag size={16} />
                  Encerrar
                </button>
              </div>
            </div>
          </div>
        )}
      </PlacarProvider>
    );
  }

  return (
    <Frame>
      {tela.tipo === 'carregando' && <p className="text-sm text-ink-400">Abrindo a partida…</p>}
      {tela.tipo === 'invalido' && <p className="text-sm text-ink-300">{tela.texto}</p>}
      {tela.tipo === 'em_uso' && (
        <div className="rounded-2xl border border-ink-800 bg-ink-900 p-5 text-center">
          <Lock size={28} className="mx-auto text-amber-300" />
          <p className="mt-3 text-lg font-semibold text-ink-50">Este link já está em uso</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-400">
            Outro celular está marcando esta partida{tela.grupo ? ` (${tela.grupo})` : ''}. Se for você
            em outro aparelho, peça a um administrador para liberar o link.
          </p>
        </div>
      )}
      {tela.tipo === 'encerrada' && <JogoEncerrado grupo={tela.grupo} estado={tela.estado} />}
    </Frame>
  );
}

function JogoEncerrado({ grupo, estado }: { grupo: string; estado: LiveMatch }) {
  const [a, b] = estado.teams;
  const jogados = estado.sets.filter((g) => (g.rallies?.length ?? 0) > 0);
  const venceu = (id: string) =>
    jogados.filter((g) => g.finished && (g.teamAId === id ? g.scoreA > g.scoreB : g.scoreB > g.scoreA)).length;
  const semSetFechado = !jogados.some((g) => g.finished);
  const ultimo = jogados[jogados.length - 1];
  return (
    <div className="rounded-2xl border border-ink-800 bg-ink-900 p-5 text-center">
      <Flag size={26} className="mx-auto text-brand-400" />
      <p className="mt-3 text-lg font-semibold text-ink-50">Jogo encerrado</p>
      {grupo && <p className="text-xs text-ink-500">{grupo}</p>}
      <div className="mt-4 flex items-center justify-center gap-4">
        <span className="min-w-0 flex-1 truncate text-right text-sm font-semibold text-ink-200">{a.name}</span>
        <span className="text-3xl font-bold tabular-nums text-ink-50">
          {/* Sem set fechado, o placar que vale é o do set em que parou */}
          {semSetFechado ? `${ultimo?.scoreA ?? 0} – ${ultimo?.scoreB ?? 0}` : `${venceu(a.id)} – ${venceu(b.id)}`}
        </span>
        <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-ink-200">{b.name}</span>
      </div>
      {jogados.length > 0 && (
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {jogados.map((g, i) => (
            <span key={g.id} className="rounded-lg bg-ink-800 px-2.5 py-1 text-xs tabular-nums text-ink-300">
              {i + 1}º {g.scoreA}–{g.scoreB}
            </span>
          ))}
        </div>
      )}
      <p className="mt-4 text-sm text-ink-400">Os dados já estão com os administradores do grupo. Obrigado por marcar!</p>
    </div>
  );
}
