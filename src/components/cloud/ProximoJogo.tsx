import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarPlus,
  ChevronDown,
  Lock,
  MapPin,
  MessageCircle,
  RefreshCw,
  Shuffle,
  UserPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/store/useAppStore';
import { useAuth } from '@/store/useAuth';
import {
  createEvent,
  createGroup,
  fetchAttendance,
  findMyGroup,
  groupLink,
  guestLink,
  openEvent,
  pullLinkAdded,
  setListClosed,
  shareOnWhatsApp,
  syncAmador,
  type Attendance,
  type CloudEvent,
  type CloudGroup,
} from '@/lib/cloud';
import { nomeDeExibicao } from '@/lib/nome';
import { distribuirVagas, joga } from '@/lib/vagas';
import { explain, NameList } from '@/components/cloud/partes';
import type { Player } from '@/types';

const fmtEvent = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * O jogo da semana, no topo da aba Jogo: abrir o jogo, os dois convites, as
 * respostas e "fechar a lista e sortear". Era a metade de baixo da tela
 * Convites, que deixou de existir (docs/telas-amador.md, etapa 3).
 *
 * Carregado sob demanda e só para quem tem sessão salva — ver lib/sessao.ts.
 *
 * Ao montar, só LÊ da nuvem: traz quem entrou pelos links, o jogo e as
 * respostas. Subir o elenco (`syncAmador`) aposenta na nuvem quem não está
 * no aparelho; com este cartão aberto em toda visita ao Jogo, fazer isso ao
 * montar faria um segundo aparelho de elenco vazio apagar os links. Sobe só
 * nos gestos explícitos: criar grupo, abrir jogo, convidar e o ↻.
 */
export function ProximoJogo() {
  const ready = useAuth((s) => s.ready);
  const session = useAuth((s) => s.session);
  const navigate = useNavigate();

  if (!ready) return null;
  if (!session) {
    return (
      <button
        onClick={() => navigate('/entrar?volta=/amador')}
        className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-ink-800 bg-ink-900 px-4 py-3 text-left"
      >
        <MessageCircle size={18} className="shrink-0 text-brand-400" />
        <span className="min-w-0 flex-1 text-sm text-ink-300">
          Confirmação pelo WhatsApp
          <span className="block text-xs text-ink-500">Entre para convidar o grupo</span>
        </span>
      </button>
    );
  }
  return <ComGrupo />;
}

function ComGrupo() {
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
    <section className="mb-4 rounded-2xl border border-ink-800 bg-ink-900 p-4">
      {error && (
        <p className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300">
          {error}
        </p>
      )}
      {group ? (
        <Jogo group={group} onError={setError} />
      ) : (
        <>
          <p className="text-[15px] font-semibold text-ink-50">Crie o seu grupo</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-400">
            Os jogadores deste aparelho vão junto, e o grupo ganha links para o WhatsApp.
            Nada sai do aparelho: a nuvem recebe uma cópia.
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
    </section>
  );
}

function Jogo({ group, onError }: { group: CloudGroup; onError: (m: string | null) => void }) {
  const navigate = useNavigate();
  const players = useAppStore((s) => s.players);
  const updatePlayer = useAppStore((s) => s.updatePlayer);
  const [event, setEvent] = useState<CloudEvent | null | undefined>(undefined);
  const [answers, setAnswers] = useState<Attendance>({});
  const [linkAdded, setLinkAdded] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [when, setWhen] = useState(defaultWhen);
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [slots, setSlots] = useState('');
  const [busy, setBusy] = useState(false);

  // Só leitura — ver o comentário de ProximoJogo
  const load = useCallback(async () => {
    try {
      const n = await pullLinkAdded(group.id);
      if (n > 0) setLinkAdded(n);
      const ev = await openEvent(group.id);
      setEvent(ev);
      setAnswers(ev ? await fetchAttendance(ev.id) : {});
    } catch (e) {
      onError(explain(e));
      setEvent(null);
    }
  }, [group.id, onError]);

  useEffect(() => {
    load();
  }, [load]);

  // O ↻: sobe o elenco e relê
  async function refresh() {
    setBusy(true);
    onError(null);
    try {
      // A subida já traz quem entrou pelos links; a contagem é dela, porque a
      // releitura logo abaixo não vê mais ninguém novo
      const n = await syncAmador(group.id);
      if (n > 0) setLinkAdded(n);
    } catch (e) {
      onError(explain(e));
    }
    await load();
    setBusy(false);
  }

  // Com a lista aberta, as confirmações chegam sozinhas. Fechada, nada muda.
  const eventId = event?.id;
  const aberta = Boolean(event && !event.listClosed);
  useEffect(() => {
    if (!eventId || !aberta) return;
    const timer = setInterval(async () => {
      if (document.hidden) return;
      try {
        await pullLinkAdded(group.id);
        setAnswers(await fetchAttendance(eventId));
      } catch {
        /* rede oscilou: tenta de novo no próximo ciclo */
      }
    }, 20_000);
    return () => clearInterval(timer);
  }, [eventId, aberta, group.id]);

  async function handleCreateEvent() {
    const n = slots.trim() ? Number(slots) : null;
    if (n !== null && (!Number.isInteger(n) || n < 2 || n > 200)) {
      onError('Quantidade de atletas: use um número entre 2 e 200, ou deixe em branco para não ter limite.');
      return;
    }
    setBusy(true);
    onError(null);
    try {
      // Sobe antes: o link do jogo novo precisa mostrar o elenco de hoje
      await syncAmador(group.id);
      await createEvent(group.id, new Date(when), title, n, location);
      setFormOpen(false);
      await load();
    } catch (e) {
      onError(explain(e));
    }
    setBusy(false);
  }

  // O WhatsApp abre primeiro — depois de um await o navegador pode barrar a
  // janela — e o elenco sobe em seguida, em segundo plano. Até alguém tocar
  // no link, a subida já terminou.
  function convidar(text: string) {
    shareOnWhatsApp(text);
    syncAmador(group.id).catch((e) => onError(explain(e)));
  }

  const cloudPlayers = players.filter((p) => p.remoteId && !p.pending);
  const dist = distribuirVagas(
    event?.slots ?? null,
    cloudPlayers.map((p) => ({
      id: p.remoteId!,
      kind: p.kind ?? 'mensalista',
      status: answers[p.remoteId!]?.status ?? null,
      answeredAt: answers[p.remoteId!]?.answeredAt ?? null,
    })),
  );
  const sit = (p: Player) => (p.remoteId ? dist.situacao.get(p.remoteId) : undefined);
  const mensalistas = cloudPlayers.filter((p) => p.kind !== 'convidado');
  const convidados = cloudPlayers.filter((p) => p.kind === 'convidado');
  const byTipo = (list: Player[], tipo: string) => list.filter((p) => sit(p)?.tipo === tipo);
  const semResposta = (list: Player[]) =>
    list.filter((p) => !sit(p) || sit(p)?.tipo === 'sem_resposta');
  const fila = convidados
    .filter((p) => sit(p)?.tipo === 'fila')
    .sort((a, b) => {
      const pa = sit(a);
      const pb = sit(b);
      return (pa?.tipo === 'fila' ? pa.posicao : 0) - (pb?.tipo === 'fila' ? pb.posicao : 0);
    });

  // O sorteio é de quem tem vaga neste jogo, e só deles.
  //
  // A lista fecha ANTES de sortear. Aberta, uma resposta que chegasse depois
  // mudaria quem tem vaga, e os times publicados no link deixariam de bater
  // com a lista que o mesmo link mostra logo abaixo.
  const jogam = dist.mensalistasConfirmados + dist.convidadosComVaga;
  async function drawWithConfirmed() {
    if (!event) return;
    if (!event.listClosed) {
      setBusy(true);
      try {
        await setListClosed(event.id, true);
        await load();
      } catch (e) {
        setBusy(false);
        // Sortear é local e não pode depender de sinal: avisa e deixa seguir
        if (!window.confirm(`${explain(e)}\n\nA lista continua aberta. Sortear assim mesmo?`)) return;
      }
      setBusy(false);
    }
    for (const p of players) {
      if (p.pending) continue;
      const present = joga(sit(p));
      if (p.present !== present) updatePlayer(p.id, { present });
    }
    navigate('/sortear', { state: { eventId: event.id } });
  }

  async function toggleList() {
    if (!event) return;
    const fechar = !event.listClosed;
    const pergunta = fechar
      ? 'Fechar a lista? Os links param de aceitar respostas e a fila congela.'
      : event.teams
        ? 'Reabrir a lista? Os links voltam a aceitar respostas e os times publicados saem do link.'
        : 'Reabrir a lista? Os links voltam a aceitar respostas.';
    if (!window.confirm(pergunta)) return;
    setBusy(true);
    try {
      await setListClosed(event.id, fechar);
      await load();
    } catch (e) {
      onError(explain(e));
    }
    setBusy(false);
  }

  const nome = event?.title || group.name;
  const detalhes = [
    event ? `📅 ${fmtEvent(event.startsAt)}` : '',
    event?.location ? `📍 ${event.location}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  if (event === undefined) {
    return <p className="text-sm text-ink-500">Carregando o próximo jogo…</p>;
  }

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold tracking-wide text-brand-400 uppercase">
          Próximo jogo
        </p>
        <button
          onClick={refresh}
          disabled={busy}
          className="-mt-1 -mr-1 p-1 text-ink-500"
          aria-label="Atualizar respostas"
        >
          <RefreshCw size={16} className={busy ? 'animate-spin' : ''} />
        </button>
      </div>

      {linkAdded > 0 && (
        <p className="mt-2 rounded-xl border border-brand-500/30 bg-brand-500/10 px-3 py-2 text-xs leading-relaxed text-brand-200">
          {linkAdded === 1
            ? '1 pessoa entrou pelo link e já está no seu elenco'
            : `${linkAdded} pessoas entraram pelo link e já estão no seu elenco`}{' '}
          com nível 3. Ajuste no Elenco antes de sortear.
        </p>
      )}

      {event ? (
        <>
          <p className="mt-1 text-[17px] font-semibold text-ink-50">{nome}</p>
          <p className="text-sm capitalize text-ink-300">{fmtEvent(event.startsAt)}</p>
          {event.location && (
            <p className="flex items-center gap-1 text-sm text-ink-300">
              <MapPin size={14} className="shrink-0 text-ink-500" />
              {event.location}
            </p>
          )}
          <p className="mt-2 text-sm text-ink-300">
            <strong className="text-ink-50">{jogam}</strong>
            {event.slots ? ` de ${event.slots} atletas confirmados` : ' confirmados · sem limite'}
            {dist.naFila > 0 && ` · ${dist.naFila} na fila`}
          </p>
          {event.listClosed && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-300">
              <Lock size={13} className="shrink-0 text-ink-500" />
              Lista fechada
              {event.teams ? ' · times publicados no link' : ' · os links não aceitam mais respostas'}
            </p>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              className="h-auto flex-col gap-1 py-2.5"
              onClick={() =>
                convidar(
                  `⚡ ${nome}\n${detalhes}\n\nMensalistas, confirmem: toque no link, escolha seu nome e marque se vai.\n${groupLink(group.code)}`,
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
                  `⚡ ${nome}\n${detalhes}\n\nQuer jogar? Coloque seu nome na lista de convidados. Mensalistas têm prioridade; se sobrar vaga, entra por ordem de chegada.\n${guestLink(group.guestCode!)}`,
                )
              }
            >
              <UserPlus size={18} />
              <span className="text-[13px] leading-tight">Convidar convidados</span>
            </Button>
          </div>

          <details className="group mt-3">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-brand-400">
              <ChevronDown size={15} className="transition-transform group-open:rotate-180" />
              Ver respostas
            </summary>
            <div className="mt-2">
              <p className="text-xs text-ink-400">
                Mensalistas: {dist.mensalistasConfirmados} vão ·{' '}
                {byTipo(mensalistas, 'nao_vou').length} não vão ·{' '}
                {semResposta(mensalistas).length} sem resposta
              </p>
              <NameList label="Vão" tone="ok" names={byTipo(mensalistas, 'confirmado').map((p) => nomeDeExibicao(p))} />
              <NameList label="Não vão" tone="no" names={byTipo(mensalistas, 'nao_vou').map((p) => nomeDeExibicao(p))} />
              <NameList label="Sem resposta" tone="none" names={semResposta(mensalistas).map((p) => nomeDeExibicao(p))} />

              <p className="mt-4 text-xs text-ink-400">
                Convidados: {dist.convidadosComVaga} com vaga · {dist.naFila} na fila
                {event.slots != null && ` · ${dist.livres} vagas livres`}
              </p>
              <NameList label="Com vaga" tone="ok" names={byTipo(convidados, 'vaga').map((p) => nomeDeExibicao(p))} />
              {fila.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
                    Fila
                  </p>
                  <ol className="flex flex-col gap-1">
                    {fila.map((p) => {
                      const s = sit(p);
                      return (
                        <li key={p.id} className="flex items-center gap-2 text-sm text-ink-300">
                          <span className="w-5 shrink-0 text-right text-xs tabular-nums text-ink-500">
                            {s?.tipo === 'fila' ? `${s.posicao}º` : ''}
                          </span>
                          {nomeDeExibicao(p)}
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )}
              <NameList label="Não vão" tone="no" names={byTipo(convidados, 'nao_vou').map((p) => nomeDeExibicao(p))} />
              {convidados.length === 0 && (
                <p className="mt-2 text-xs text-ink-500">Nenhum convidado inscrito ainda.</p>
              )}
            </div>
          </details>

          <Button
            size="lg"
            className="mt-4 w-full"
            disabled={jogam < 4 || busy}
            onClick={drawWithConfirmed}
          >
            <Shuffle size={19} strokeWidth={2.5} />
            {jogam < 4
              ? 'Mínimo de 4 confirmados para sortear'
              : event.listClosed
                ? `Sortear com os ${jogam} confirmados`
                : `Fechar a lista e sortear com ${jogam}`}
          </Button>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
            {event.slots && jogam < event.slots
              ? `Ainda faltam ${event.slots - jogam} para completar. Dá para sortear assim mesmo.`
              : 'Entram no sorteio só os confirmados com vaga.'}{' '}
            {event.listClosed
              ? 'Depois de sortear, publique os times no link.'
              : 'As confirmações atualizam sozinhas enquanto esta tela está aberta.'}
          </p>
          <button
            onClick={toggleList}
            disabled={busy}
            className="mt-2 text-xs text-ink-500 underline"
          >
            {event.listClosed ? 'Reabrir a lista' : 'Só fechar a lista, sem sortear'}
          </button>
        </>
      ) : (
        <p className="mt-2 text-sm leading-relaxed text-ink-400">
          Abra o jogo com data, horário, local e quantidade de atletas. Depois é só
          convidar pelo WhatsApp.
        </p>
      )}

      <div className="mt-4 border-t border-ink-800 pt-3">
        {!formOpen ? (
          <button
            onClick={() => setFormOpen(true)}
            className="flex items-center text-sm font-medium text-brand-400"
          >
            <CalendarPlus size={15} className="mr-1.5" />
            {event ? 'Abrir outro jogo' : 'Abrir jogo'}
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-ink-400">Data e horário</label>
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="w-full rounded-xl bg-ink-800 px-3 py-3 text-[15px] text-ink-50 outline-none [color-scheme:dark]"
            />
            <label className="mt-1 text-xs font-medium text-ink-400">Local</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={120}
              placeholder="Ex.: Quadra do Clube, Rua das Flores 100"
              className="w-full rounded-xl bg-ink-800 px-3 py-3 text-[15px] text-ink-50 placeholder:text-ink-500 outline-none"
            />
            <label className="mt-1 text-xs font-medium text-ink-400">Quantidade de atletas</label>
            <input
              value={slots}
              onChange={(e) => setSlots(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              placeholder="Ex.: 20 — em branco, sem limite"
              className="w-full rounded-xl bg-ink-800 px-3 py-3 text-[15px] text-ink-50 placeholder:text-ink-500 outline-none"
            />
            <label className="mt-1 text-xs font-medium text-ink-400">Nome do jogo (opcional)</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Pelada de quinta"
              className="w-full rounded-xl bg-ink-800 px-3 py-3 text-[15px] text-ink-50 placeholder:text-ink-500 outline-none"
            />
            <div className="mt-1 flex gap-2">
              <Button variant="secondary" onClick={() => setFormOpen(false)}>
                Cancelar
              </Button>
              <Button className="flex-1" disabled={busy || !when} onClick={handleCreateEvent}>
                {busy ? 'Salvando…' : event ? 'Trocar pelo novo jogo' : 'Abrir jogo'}
              </Button>
            </div>
            <p className="text-[11px] leading-relaxed text-ink-500">
              Mensalista que confirma sempre joga. Convidado entra numa fila e joga se
              sobrar vaga, por ordem de chegada.
              {event && ' Abrir outro jogo fecha o atual; as respostas dele ficam guardadas.'}
            </p>
          </div>
        )}
      </div>
    </>
  );
}

/** Amanhã às 20h, no formato do datetime-local */
function defaultWhen(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(20, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
