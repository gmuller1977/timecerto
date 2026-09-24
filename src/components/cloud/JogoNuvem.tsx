import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Lock, MessageCircle, RefreshCw, Send, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/store/useAppStore';
import { useAuth } from '@/store/useAuth';
import { useJogoStore } from '@/store/useJogoStore';
import {
  createGroup,
  fetchAttendance,
  findMyGroup,
  groupLink,
  guestLink,
  openEvent,
  publicarJogo,
  pullLinkAdded,
  setListClosed,
  shareOnWhatsApp,
  syncAmador,
  type CloudEvent,
  type CloudGroup,
} from '@/lib/cloud';
import { hoje } from '@/lib/jogo';
import { explain } from '@/components/cloud/partes';
import type { ConfirmacaoStatus, Jogo } from '@/types';

const fmtData = (jogo: Jogo) =>
  new Date(`${jogo.date}T${jogo.time}`).toLocaleString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

/** O evento da nuvem como campos do Jogo */
function doEvento(ev: CloudEvent) {
  const d = new Date(ev.startsAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: hoje(d),
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    place: ev.location ?? '',
    vagas: ev.slots,
    remoteId: ev.id,
    listaFechada: ev.listClosed,
  };
}

/**
 * A parte do jogo que fala com a nuvem, dentro do bloco do jogo na aba Jogo:
 * os dois convites, a lista fechada e as respostas dos links entrando no Jogo.
 * Carregada sob demanda, só para quem tem sessão salva (lib/sessao.ts).
 *
 * O Jogo do aparelho é a fonte de quem vem; o evento da nuvem é o canal dos
 * links. As respostas que chegam por lá entram como confirmações
 * (`importarDoLink`), e vale a mais recente entre o toque do organizador e a
 * resposta do link.
 *
 * Ao montar, só LÊ da nuvem: subir o elenco (`syncAmador`) aposenta lá quem
 * não está no aparelho. Sobe só em gestos explícitos.
 */
export function JogoNuvem({ jogo }: { jogo: Jogo | null }) {
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
  return <ComGrupo jogo={jogo} />;
}

function ComGrupo({ jogo }: { jogo: Jogo | null }) {
  const [group, setGroup] = useState<CloudGroup | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('Pelada');
  const [busy, setBusy] = useState(false);

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

  async function handleCreate() {
    setBusy(true);
    setError(null);
    try {
      const g = await createGroup('amador', name || 'Meu grupo');
      await syncAmador(g.id);
      setGroup(g);
    } catch (e) {
      setError(explain(e));
    }
    setBusy(false);
  }

  if (group === undefined) return null;

  return (
    <div className="mt-3 border-t border-ink-800 pt-3">
      {error && (
        <p className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300">
          {error}
        </p>
      )}
      {group ? (
        <Links group={group} jogo={jogo} onError={setError} />
      ) : (
        <>
          <p className="text-sm font-semibold text-ink-50">Convide pelo WhatsApp</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-400">
            Crie o grupo para ter os links. Os jogadores deste aparelho vão junto; a nuvem
            recebe uma cópia.
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
      )}
    </div>
  );
}

function Links({
  group,
  jogo,
  onError,
}: {
  group: CloudGroup;
  jogo: Jogo | null;
  onError: (m: string | null) => void;
}) {
  const criarJogo = useJogoStore((s) => s.criarJogo);
  const atualizarJogo = useJogoStore((s) => s.atualizarJogo);
  const importarDoLink = useJogoStore((s) => s.importarDoLink);
  const [evento, setEvento] = useState<CloudEvent | null | undefined>(undefined);
  const [linkAdded, setLinkAdded] = useState(0);
  const [busy, setBusy] = useState(false);

  /**
   * Lê a nuvem e acerta o Jogo do aparelho com ela. Só leitura.
   *
   * A adoção é o que impede a lista da semana de sumir na atualização: um
   * jogo aberto na nuvem, com respostas, vira o Jogo do aparelho — ou se liga
   * ao Jogo que a migração do antigo `present` criou. Jogo criado aqui e ainda
   * não publicado NÃO adota: ele ganha o botão de publicar, que troca o evento.
   */
  const load = useCallback(async () => {
    try {
      const n = await pullLinkAdded(group.id);
      if (n > 0) setLinkAdded(n);
      const ev = await openEvent(group.id);
      setEvento(ev);
      if (!ev) return;

      const atual = useJogoStore.getState().jogos.find((j) => j.status === 'aberto');
      let alvo = atual;
      if (!atual || (atual.remoteId && atual.remoteId !== ev.id)) {
        // Sem jogo aqui, ou outro aparelho abriu um jogo novo: vale o da nuvem
        alvo = criarJogo({ sport: useAppStore.getState().sport, ...doEvento(ev) });
      } else if (!atual.remoteId && atual.migrado) {
        atualizarJogo(atual.id, doEvento(ev));
      } else if (atual.remoteId === ev.id && atual.listaFechada !== ev.listClosed) {
        atualizarJogo(atual.id, { listaFechada: ev.listClosed });
      }
      if (!alvo || (alvo.remoteId && alvo.remoteId !== ev.id)) return;
      if (!alvo.remoteId && !alvo.migrado) return;

      const respostas = await fetchAttendance(ev.id);
      const localDe = new Map(
        useAppStore
          .getState()
          .players.filter((p) => p.remoteId)
          .map((p) => [p.remoteId!, p.id]),
      );
      importarDoLink(
        alvo.id,
        Object.entries(respostas).flatMap(([remoto, r]) => {
          const playerId = localDe.get(remoto);
          if (!playerId) return [];
          const status: ConfirmacaoStatus = r.status === 'vou' ? 'confirmado' : 'recusado';
          return [{ playerId, status, at: r.answeredAt }];
        }),
      );
    } catch (e) {
      onError(explain(e));
      setEvento(null);
    }
  }, [group.id, criarJogo, atualizarJogo, importarDoLink, onError]);

  useEffect(() => {
    load();
  }, [load]);

  // Com a lista aberta, as respostas chegam sozinhas. Fechada, nada muda.
  const aberta = Boolean(jogo?.remoteId && !jogo.listaFechada);
  useEffect(() => {
    if (!aberta) return;
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, 20_000);
    return () => clearInterval(timer);
  }, [aberta, load]);

  // O ↻: sobe o elenco e relê
  async function refresh() {
    setBusy(true);
    onError(null);
    try {
      // A subida já traz quem entrou pelos links; a contagem é dela
      const n = await syncAmador(group.id);
      if (n > 0) setLinkAdded(n);
    } catch (e) {
      onError(explain(e));
    }
    await load();
    setBusy(false);
  }

  async function publicar() {
    if (!jogo) return;
    setBusy(true);
    onError(null);
    try {
      const ev = await publicarJogo(group.id, jogo);
      atualizarJogo(jogo.id, { remoteId: ev.id, listaFechada: false });
      await load();
    } catch (e) {
      onError(explain(e));
    }
    setBusy(false);
  }

  // O WhatsApp abre primeiro — depois de um await o navegador pode barrar a
  // janela — e o elenco sobe em seguida, em segundo plano
  function convidar(text: string) {
    shareOnWhatsApp(text);
    syncAmador(group.id).catch((e) => onError(explain(e)));
  }

  async function toggleList() {
    if (!jogo?.remoteId) return;
    const fechar = !jogo.listaFechada;
    const pergunta = fechar
      ? 'Fechar a lista? Os links param de aceitar respostas e a fila congela.'
      : evento?.teams
        ? 'Reabrir a lista? Os links voltam a aceitar respostas e os times publicados saem do link.'
        : 'Reabrir a lista? Os links voltam a aceitar respostas.';
    if (!window.confirm(pergunta)) return;
    setBusy(true);
    try {
      await setListClosed(jogo.remoteId, fechar);
      atualizarJogo(jogo.id, { listaFechada: fechar });
      await load();
    } catch (e) {
      onError(explain(e));
    }
    setBusy(false);
  }

  if (evento === undefined) return <p className="text-xs text-ink-500">Lendo os links…</p>;

  const nosLinks = Boolean(jogo?.remoteId && evento?.id === jogo.remoteId);
  const detalhes = jogo
    ? [`📅 ${fmtData(jogo)}`, jogo.place ? `📍 ${jogo.place}` : ''].filter(Boolean).join('\n')
    : '';

  return (
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
            : `${linkAdded} pessoas entraram pelo link e já estão em Atletas`}{' '}
          com nível 3. Ajuste em Atletas antes de sortear.
        </p>
      )}

      {!jogo ? (
        <p className="mt-1 text-xs leading-relaxed text-ink-500">
          Crie o jogo acima e ele vai para os links.
        </p>
      ) : !nosLinks ? (
        <>
          <p className="mt-1 text-xs leading-relaxed text-ink-400">
            Este jogo ainda não está nos links. Publicar troca o jogo que os links
            mostram por este.
          </p>
          <Button className="mt-2 w-full" disabled={busy} onClick={publicar}>
            <Send size={17} />
            {busy ? 'Publicando…' : 'Publicar nos links'}
          </Button>
        </>
      ) : (
        <>
          {jogo.listaFechada && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-300">
              <Lock size={13} className="shrink-0 text-ink-500" />
              Lista fechada
              {evento?.teams ? ' · times publicados no link' : ' · os links não aceitam mais respostas'}
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
            As respostas dos links entram na lista abaixo
            {jogo.listaFechada ? '.' : ' e atualizam sozinhas enquanto esta tela está aberta.'}
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
  );
}
