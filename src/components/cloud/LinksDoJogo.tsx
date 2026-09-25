import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellRing, ChevronRight, Lock, MessageCircle, RefreshCw, SkipForward, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/store/useAuth';
import { useJogoStore } from '@/store/useJogoStore';
import { useAppStore } from '@/store/useAppStore';
import { vagasDoJogo } from '@/lib/vagas';
import { haQuantoChamado } from '@/lib/jogo';
import { nomeDeExibicao } from '@/lib/nome';
import { whatsappTo } from '@/lib/phone';
import {
  createGroup,
  findMyGroup,
  groupLink,
  guestLink,
  setListClosed,
  shareOnWhatsApp,
  sincronizarJogos,
  syncAmador,
  type CloudGroup,
} from '@/lib/cloud';
import { explain } from '@/components/cloud/partes';
import type { Jogo, Player } from '@/types';

const fmtData = (jogo: Jogo) =>
  new Date(`${jogo.date}T${jogo.time}`).toLocaleString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * Os links do WhatsApp de UM jogo, dentro da página dele. Carregado sob
 * demanda, só com sessão salva (lib/sessao.ts).
 *
 * Os links mostram o PRÓXIMO jogo (migração 013, `proximoJogo`). Este
 * componente só oferece convite e lista fechada quando o jogo é o próximo; os
 * outros esperam a vez. Trazer respostas, enviar as do organizador e manter o
 * jogo igual nos aparelhos é da sincronização (SincronizacaoNuvem) — aqui não.
 */
export function LinksDoJogo({ jogo, proximo }: { jogo: Jogo; proximo: Jogo | null }) {
  const ready = useAuth((s) => s.ready);
  const session = useAuth((s) => s.session);
  const navigate = useNavigate();

  if (!ready) return null;
  if (!session) {
    return (
      <button
        onClick={() => navigate('/entrar?volta=/amador')}
        className="mt-3 flex w-full items-center gap-3 rounded-xl border border-ink-800 px-3 py-2.5 text-left"
      >
        <MessageCircle size={17} className="shrink-0 text-brand-400" />
        <span className="min-w-0 flex-1 text-sm text-ink-300">
          Confirmação pelo WhatsApp
          <span className="block text-xs text-ink-500">Entre para convidar o grupo</span>
        </span>
        <ChevronRight size={17} className="shrink-0 text-ink-600" />
      </button>
    );
  }
  return <ComGrupo jogo={jogo} proximo={proximo} />;
}

function ComGrupo({ jogo, proximo }: { jogo: Jogo; proximo: Jogo | null }) {
  const atualizarJogo = useJogoStore((s) => s.atualizarJogo);
  const [group, setGroup] = useState<CloudGroup | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('Pelada');
  const [busy, setBusy] = useState(false);
  const [linkAdded, setLinkAdded] = useState(0);

  useEffect(() => {
    let alive = true;
    findMyGroup('amador')
      .then((g) => alive && setGroup(g))
      .catch((e) => {
        if (!alive) return;
        setError(explain(e));
        setGroup(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function sincronizar(g: CloudGroup) {
    const n = await syncAmador(g.id);
    if (n > 0) setLinkAdded(n);
    await sincronizarJogos(g.id);
  }

  async function handleCreate() {
    setBusy(true);
    setError(null);
    try {
      const g = await createGroup('amador', name || 'Meu grupo');
      setGroup(g);
      await sincronizar(g);
    } catch (e) {
      setError(explain(e));
    }
    setBusy(false);
  }

  // O ↻: sincroniza agora, sem esperar a rodada automática
  async function refresh() {
    if (!group) return;
    setBusy(true);
    setError(null);
    try {
      await sincronizar(group);
    } catch (e) {
      setError(explain(e));
    }
    setBusy(false);
  }

  // O WhatsApp abre primeiro — depois de um await o navegador pode barrar a
  // janela — e a sincronização vem em seguida, em segundo plano
  function convidar(text: string) {
    shareOnWhatsApp(text);
    if (group) sincronizar(group).catch((e) => setError(explain(e)));
  }

  async function toggleList() {
    if (!jogo.remoteId) return;
    const fechar = !jogo.listaFechada;
    const pergunta = fechar
      ? 'Fechar a lista? Quem tem vaga continua; quem chegar pelos links entra na fila de espera e é chamado se abrir vaga.'
      : jogo.timesPublicados
        ? 'Reabrir a lista? Quem estava na fila de espera volta para a fila normal, e os times publicados saem do link.'
        : 'Reabrir a lista? Quem estava na fila de espera volta para a fila normal.';
    if (!window.confirm(pergunta)) return;
    setBusy(true);
    try {
      await setListClosed(jogo.remoteId, fechar);
      atualizarJogo(jogo.id, { listaFechada: fechar, ...(fechar ? {} : { timesPublicados: false }) });
    } catch (e) {
      setError(explain(e));
    }
    setBusy(false);
  }

  if (group === undefined) return null;

  const ehProximo = proximo?.id === jogo.id;
  const detalhes = [`📅 ${fmtData(jogo)}`, jogo.place ? `📍 ${jogo.place}` : ''].filter(Boolean).join('\n');

  return (
    <div className="mt-3 border-t border-ink-800 pt-3">
      {error && (
        <p className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300">
          {error}
        </p>
      )}
      {!group ? (
        <>
          <p className="text-sm font-semibold text-ink-50">Convide pelo WhatsApp</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-400">
            Crie o grupo para ter os links. Os jogadores e os jogos deste aparelho vão junto;
            a nuvem passa a guardar tudo.
          </p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Nome do grupo"
            className="mt-3 w-full rounded-xl bg-ink-800 px-3 py-3 text-[15px] text-ink-50 outline-none"
          />
          <Button className="mt-3 w-full" disabled={busy} onClick={handleCreate}>
            {busy ? 'Criando…' : 'Criar grupo'}
          </Button>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
              Links do WhatsApp
            </p>
            <button
              onClick={refresh}
              disabled={busy}
              className="-mr-1 p-1 text-ink-500"
              aria-label="Atualizar respostas"
            >
              <RefreshCw size={15} className={busy ? 'animate-spin' : ''} />
            </button>
          </div>

          {linkAdded > 0 && (
            <p className="mt-2 rounded-xl border border-brand-500/30 bg-brand-500/10 px-3 py-2 text-xs leading-relaxed text-brand-200">
              {linkAdded === 1
                ? '1 pessoa entrou pelo link e já está em Atletas'
                : `${linkAdded} pessoas entraram pelo link e já estão em Atletas`}
              . Ajuste o nível antes de sortear.
            </p>
          )}

          {!ehProximo ? (
            <p className="mt-1 text-xs leading-relaxed text-ink-400">
              {jogo.status !== 'aberto'
                ? 'Este jogo já saiu dos links.'
                : proximo
                  ? `Os links mostram o próximo jogo (${new Date(`${proximo.date}T${proximo.time}`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}). Este passa a receber respostas quando for o próximo.`
                  : 'Os links mostram o próximo jogo.'}
            </p>
          ) : !jogo.remoteId ? (
            <p className="mt-1 text-xs text-ink-500">Levando o jogo para os links…</p>
          ) : (
            <>
              {jogo.listaFechada && (
                <ChamadasDaEspera jogo={jogo} group={group} detalhes={detalhes} />
              )}
              {jogo.listaFechada && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-300">
                  <Lock size={13} className="shrink-0 text-ink-500" />
                  Lista fechada
                  {jogo.timesPublicados
                    ? ' · times publicados no link'
                    : ' · quem chega entra na fila de espera'}
                </p>
              )}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button
                  className="h-auto flex-col gap-1 py-2.5"
                  onClick={() =>
                    convidar(
                      `⚡ ${group.name}\n${detalhes}\n\nMensalistas, confirmem: toque no link, escolha seu nome e marque se vai.\n${groupLink(group.code)}`,
                    )
                  }
                >
                  <MessageCircle size={18} />
                  <span className="text-[13px] leading-tight">Convidar mensalistas</span>
                </Button>
                <Button
                  variant="secondary"
                  className="h-auto flex-col gap-1 py-2.5"
                  disabled={!group.guestCode}
                  onClick={() =>
                    convidar(
                      `⚡ ${group.name}\n${detalhes}\n\nQuer jogar? Coloque seu nome na lista de convidados. Mensalistas têm prioridade; se sobrar vaga, entra por ordem de chegada.\n${guestLink(group.guestCode!)}`,
                    )
                  }
                >
                  <UserPlus size={18} />
                  <span className="text-[13px] leading-tight">Convidar convidados</span>
                </Button>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
                As respostas dos links entram na lista de confirmados e atualizam sozinhas.
              </p>
              <button
                onClick={toggleList}
                disabled={busy}
                className="mt-1 text-xs text-ink-500 underline"
              >
                {jogo.listaFechada ? 'Reabrir a lista' : 'Fechar a lista sem sortear'}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Lista fechada (migração 015): quem o banco chamou da fila de espera. O
 * administrador avisa pelo WhatsApp — direto no número, se o cadastro tem — e
 * passa a vez quando achar que esperou o bastante. Não há prazo automático:
 * perto do jogo, só ele sabe quanto dá para esperar.
 */
function ChamadasDaEspera({ jogo, group, detalhes }: { jogo: Jogo; group: CloudGroup; detalhes: string }) {
  const players = useAppStore((s) => s.players);
  const responder = useJogoStore((s) => s.responder);
  const dist = useMemo(() => vagasDoJogo(jogo, players), [jogo, players]);
  // O "há quanto tempo" anda sozinho
  const [, setTique] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTique((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const porId = new Map(players.map((p) => [p.id, p]));
  const chamados = players.filter((p) => dist.situacao.get(p.id)?.tipo === 'chamado');
  const livres = dist.livres ?? 0;

  if (chamados.length === 0) {
    if (livres > 0 && dist.naEspera === 0) {
      return (
        <p className="mt-2 rounded-xl border border-ink-800 px-3 py-2.5 text-xs leading-relaxed text-ink-400">
          {livres === 1 ? 'Há 1 vaga aberta' : `Há ${livres} vagas abertas`} e ninguém na fila de espera.
          Quem entrar pelo link é chamado na hora.
        </p>
      );
    }
    return null;
  }

  function chamar(p: Player) {
    const base = p.kind === 'convidado' && group.guestCode ? guestLink(group.guestCode) : groupLink(group.code);
    const link = p.remoteId ? `${base}?eu=${p.remoteId}` : base;
    const texto = `⚡ ${group.name}
${detalhes}

${nomeDeExibicao(p)}, abriu uma vaga e você é o próximo da fila de espera! Ainda quer jogar? Responda no link:
${link}`;
    const destino = p.phone ? whatsappTo(p.phone) : 'https://wa.me/';
    window.open(`${destino}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
  }

  function passar(p: Player) {
    const proximo = dist.naEspera > 0 ? 'O próximo da fila de espera será chamado.' : 'A fila de espera está vazia.';
    if (!window.confirm(`Passar a vez de ${nomeDeExibicao(p)}? ${proximo} Se ele responder depois, volta para o fim da fila.`)) return;
    responder(jogo.id, p.id, 'pulado');
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      {chamados.map((p) => {
        const c = jogo.confirmations.find((x) => x.playerId === p.id);
        const saiu = c?.vagaDe ? porId.get(c.vagaDe) : undefined;
        return (
          <div key={p.id} className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-200">
              <BellRing size={15} className="shrink-0" />
              Vaga aberta: {nomeDeExibicao(p)} foi chamado
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-100/80">
              {haQuantoChamado(c?.chamadoEm, true)}
              {saiu && ` · no lugar de ${nomeDeExibicao(saiu)}`}
              {' · '}esperando ele confirmar no link.
              {!p.phone && ' Sem telefone no cadastro: o WhatsApp abre para escolher o contato.'}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button size="sm" onClick={() => chamar(p)}>
                <MessageCircle size={16} />
                Chamar no WhatsApp
              </Button>
              <Button size="sm" variant="secondary" onClick={() => passar(p)}>
                <SkipForward size={16} />
                Passar a vez
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

