import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check, MapPin, UserPlus, X } from 'lucide-react';
import {
  guestAddPlayer,
  guestGroup,
  guestJoin,
  guestSetAttendance,
  type GuestGroup,
} from '@/lib/cloud';
import { distribuirVagas, type Situacao } from '@/lib/vagas';
import { getPositionLabel } from '@/lib/sports';
import type { SportId } from '@/types';
import { cn } from '@/lib/utils';

/** Quem este aparelho é, por link. Conveniência — errar custa um toque. */
const meKey = (code: string) => `timecerto:guest:${code.toUpperCase()}`;
function readMe(code: string): string | null {
  try {
    return localStorage.getItem(meKey(code));
  } catch {
    return null;
  }
}
function writeMe(code: string, id: string | null) {
  try {
    if (id) localStorage.setItem(meKey(code), id);
    else localStorage.removeItem(meKey(code));
  } catch {
    /* navegação privada: só não lembra */
  }
}

/** Mensagem do banco (em português) ou uma genérica de rede */
function dbMessage(err: unknown, fallback: string): string {
  const msg = (err as { message?: string })?.message;
  return msg && !/fetch|network/i.test(msg) ? msg : fallback;
}

const fmtEvent = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * Os dois links do WhatsApp, sem conta:
 *
 * - `/c/CÓDIGO` — mensalistas: escolhe o nome, vou / não vou, e pode levar
 *   alguém de fora (entra na fila de convidados);
 * - `/v/CÓDIGO` — convidados: põe o nome e entra na fila.
 *
 * Vaga e fila saem de `distribuirVagas`, a mesma função da tela do
 * organizador — as três telas não podem discordar sobre quem joga.
 */
export function GuestGroupPage() {
  const { code = '' } = useParams();
  const [data, setData] = useState<GuestGroup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<string | null>(() => readMe(code));
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await guestGroup(code));
      setError(null);
    } catch (e) {
      console.error('convite do grupo', e);
      setError(
        navigator.onLine
          ? 'Este convite não existe mais ou o link está incompleto. Peça outro ao organizador.'
          : 'Sem internet. Conecte e tente de novo.',
      );
    }
  }, [code]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <Frame><p className="mt-10 text-center text-sm leading-relaxed text-ink-400">{error}</p></Frame>;
  if (!data) return <Frame><p className="mt-10 text-center text-sm text-ink-500">Carregando…</p></Frame>;

  const viaConvidados = data.via === 'convidados';
  const event = data.event;
  const dist = distribuirVagas(event?.slots ?? null, data.players);
  const sit = (id: string) => dist.situacao.get(id);

  const mensalistas = data.players.filter((p) => p.kind === 'mensalista');
  const convidados = data.players.filter((p) => p.kind === 'convidado');
  const fila = convidados
    .filter((p) => sit(p.id)?.tipo === 'fila')
    .sort((a, b) => posicao(sit(a.id)) - posicao(sit(b.id)));
  const comVaga = convidados.filter((p) => sit(p.id)?.tipo === 'vaga');

  // No link de convidados, "eu" só pode ser um convidado; no dos mensalistas, um mensalista
  const mine = data.players.find(
    (p) => p.id === me && (viaConvidados ? p.kind === 'convidado' : p.kind === 'mensalista'),
  );

  async function answer(status: 'vou' | 'nao_vou') {
    if (!event || !mine) return;
    setSaving(true);
    try {
      await guestSetAttendance(code, event.id, mine.id, status);
      await load();
    } catch (e) {
      console.error('resposta de presença', e);
      setError(dbMessage(e, 'Não deu para salvar. Confira a internet e tente de novo.'));
    }
    setSaving(false);
  }

  async function submitName(e: React.FormEvent) {
    e.preventDefault();
    if (!event) return;
    setSaving(true);
    setFormError(null);
    try {
      if (viaConvidados) {
        const id = await guestJoin(code, event.id, newName);
        writeMe(code, id);
        setMe(id);
      } else {
        await guestAddPlayer(code, event.id, newName, mine?.id ?? null);
      }
      setFormOpen(false);
      setNewName('');
      await load();
    } catch (err) {
      console.error('incluir pelo link', err);
      setFormError(dbMessage(err, 'Não deu para incluir. Confira a internet.'));
    }
    setSaving(false);
  }

  const nameForm = (
    <form onSubmit={submitName} className="rounded-2xl border border-ink-800 bg-ink-900 p-4">
      <p className="text-[15px] font-semibold text-ink-50">
        {viaConvidados ? 'Qual é o seu nome?' : 'Quem você vai levar?'}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-ink-500">
        {event?.slots
          ? 'Entra na fila de convidados. Mensalistas têm prioridade; se sobrar vaga, entra por ordem de chegada.'
          : 'Entra na lista de convidados, já confirmado.'}
      </p>
      <input
        autoFocus
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        maxLength={40}
        placeholder="Nome e sobrenome"
        className="mt-3 w-full rounded-xl bg-ink-800 px-3 py-3 text-[16px] text-ink-50 placeholder:text-ink-500 outline-none"
      />
      {formError && <p className="mt-2 text-sm text-red-300">{formError}</p>}
      <div className="mt-3 flex gap-2">
        {!viaConvidados && (
          <button
            type="button"
            onClick={() => {
              setFormOpen(false);
              setFormError(null);
            }}
            className="h-12 rounded-xl border border-ink-700 px-4 text-sm text-ink-300"
          >
            Cancelar
          </button>
        )}
        <button
          type="submit"
          disabled={saving || newName.trim().length < 2}
          className="h-12 flex-1 rounded-xl bg-brand-500 font-semibold text-ink-950 disabled:opacity-40"
        >
          {saving ? 'Enviando…' : viaConvidados ? 'Quero jogar' : 'Incluir convidado'}
        </button>
      </div>
    </form>
  );

  return (
    <Frame>
      <p className="text-xs font-semibold tracking-wide text-brand-400 uppercase">
        {viaConvidados ? 'Lista de convidados' : 'Mensalistas'}
      </p>
      <h1 className="text-2xl font-bold tracking-tight">{data.group.name}</h1>

      {!event ? (
        <p className="mt-6 rounded-2xl border border-ink-800 bg-ink-900 p-4 text-sm leading-relaxed text-ink-400">
          Nenhum jogo marcado agora. Quando o organizador marcar, é neste mesmo
          link que você {viaConvidados ? 'se inscreve' : 'confirma'}.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm capitalize text-ink-300">
            {event.title ? `${event.title} · ` : ''}
            {fmtEvent(event.startsAt)}
          </p>
          {event.location && (
            <p className="flex items-center gap-1 text-sm text-ink-300">
              <MapPin size={14} className="shrink-0 text-ink-500" />
              {event.location}
            </p>
          )}
          <p className="mt-1 text-sm text-ink-400">
            {event.slots
              ? `${dist.mensalistasConfirmados + dist.convidadosComVaga} de ${event.slots} vagas preenchidas${dist.naFila ? ` · ${dist.naFila} na fila` : ''}`
              : `${dist.mensalistasConfirmados + dist.convidadosComVaga} confirmados`}
          </p>

          {/* Eu */}
          <section className="mt-6">
            {mine ? (
              <MyCard
                name={mine.name}
                situacao={sit(mine.id)}
                convidado={viaConvidados}
                saving={saving}
                onAnswer={answer}
                onNotMe={() => {
                  writeMe(code, null);
                  setMe(null);
                }}
              />
            ) : viaConvidados ? (
              nameForm
            ) : (
              <>
                <p className="text-[15px] font-semibold text-ink-50">Quem é você?</p>
                <p className="mt-1 text-xs text-ink-500">
                  Toque no seu nome. Este celular lembra da próxima vez.
                </p>
              </>
            )}
          </section>
        </>
      )}

      {/* Mensalistas: no link deles é a lista de escolha; no de convidados, só o total */}
      {!viaConvidados ? (
        <section className="mt-4">
          <div className="flex flex-col gap-1.5">
            {mensalistas.map((p) => (
              <button
                key={p.id}
                disabled={Boolean(mine)}
                onClick={() => {
                  writeMe(code, p.id);
                  setMe(p.id);
                }}
                className={cn(
                  'flex items-center gap-3 rounded-xl border px-3 py-3 text-left',
                  p.id === me ? 'border-brand-500/60 bg-brand-500/10' : 'border-ink-800 bg-ink-900',
                  !mine && 'active:scale-[0.99]',
                )}
              >
                <span className="min-w-0 flex-1 truncate text-[15px] text-ink-50">{p.name}</span>
                {p.position && (
                  <span className="shrink-0 text-xs text-ink-500">
                    {getPositionLabel(data.group.sport as SportId, p.position)}
                  </span>
                )}
                <span className="w-5 shrink-0">
                  {p.status === 'vou' && <Check size={17} className="text-brand-400" />}
                  {p.status === 'nao_vou' && <X size={17} className="text-ink-500" />}
                </span>
              </button>
            ))}
          </div>
          {mensalistas.length === 0 && (
            <p className="text-sm text-ink-500">O organizador ainda não cadastrou os mensalistas.</p>
          )}
          {!mine && event && (
            <p className="mt-3 text-xs leading-relaxed text-ink-500">
              Não achou seu nome? Você entra como convidado — peça ao organizador o
              link de convidados.
            </p>
          )}
        </section>
      ) : (
        event && (
          <section className="mt-6">
            <p className="mb-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">
              Mensalistas confirmados ({dist.mensalistasConfirmados})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {mensalistas
                .filter((p) => sit(p.id)?.tipo === 'confirmado')
                .map((p) => (
                  <span
                    key={p.id}
                    className="flex items-center gap-1 rounded-lg bg-brand-500/15 px-2 py-1 text-xs text-brand-200"
                  >
                    <Check size={12} />
                    {p.name}
                  </span>
                ))}
              {dist.mensalistasConfirmados === 0 && (
                <span className="text-xs text-ink-500">Ninguém confirmou ainda.</span>
              )}
            </div>
          </section>
        )
      )}

      {/* Convidados: quem tem vaga e a fila */}
      {event && (comVaga.length > 0 || fila.length > 0) && (
        <section className="mt-6">
          <p className="mb-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">
            Convidados
          </p>
          <div className="flex flex-col gap-1.5">
            {comVaga.map((p) => (
              <GuestLine key={p.id} name={p.name} invitedBy={p.invitedBy} mine={p.id === me}>
                <span className="text-xs font-medium text-brand-300">com vaga</span>
              </GuestLine>
            ))}
            {fila.map((p) => (
              <GuestLine key={p.id} name={p.name} invitedBy={p.invitedBy} mine={p.id === me}>
                <span className="text-xs text-ink-400">{posicao(sit(p.id))}º na fila</span>
              </GuestLine>
            ))}
          </div>
        </section>
      )}

      {/* Mensalista leva alguém de fora */}
      {!viaConvidados && event && mine && (
        <section className="mt-4">
          {formOpen ? (
            nameForm
          ) : (
            <button
              onClick={() => setFormOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-ink-700 py-3.5 text-sm font-medium text-brand-300"
            >
              <UserPlus size={17} />
              Levar alguém de fora
            </button>
          )}
        </section>
      )}
    </Frame>
  );
}

function posicao(s: Situacao | undefined): number {
  return s?.tipo === 'fila' ? s.posicao : 0;
}

function MyCard({
  name,
  situacao,
  convidado,
  saving,
  onAnswer,
  onNotMe,
}: {
  name: string;
  situacao: Situacao | undefined;
  convidado: boolean;
  saving: boolean;
  onAnswer: (s: 'vou' | 'nao_vou') => void;
  onNotMe: () => void;
}) {
  const vai = situacao?.tipo === 'confirmado' || situacao?.tipo === 'vaga' || situacao?.tipo === 'fila';
  const status =
    situacao?.tipo === 'vaga'
      ? { text: 'Você tem vaga neste jogo', tone: 'ok' as const }
      : situacao?.tipo === 'fila'
        ? {
            text: `Você é o ${situacao.posicao}º da fila. Se abrir vaga, você entra sozinho.`,
            tone: 'wait' as const,
          }
        : situacao?.tipo === 'confirmado'
          ? { text: 'Presença confirmada', tone: 'ok' as const }
          : null;

  return (
    <div className="rounded-2xl border border-ink-800 bg-ink-900 p-4">
      <p className="text-sm text-ink-400">
        Você é <span className="font-semibold text-ink-50">{name}</span>
        <button onClick={onNotMe} className="ml-2 text-xs text-ink-500 underline">
          não sou eu
        </button>
      </p>
      {status && (
        <p
          className={cn(
            'mt-3 rounded-xl px-3 py-2.5 text-sm font-medium',
            status.tone === 'ok' ? 'bg-brand-500/15 text-brand-200' : 'bg-ink-800 text-ink-200',
          )}
        >
          {status.text}
        </p>
      )}
      <p className="mt-3 text-[15px] font-semibold text-ink-50">
        {convidado ? (vai ? 'Mudou de ideia?' : 'Vai jogar?') : 'Você vai?'}
      </p>
      <div className="mt-2 flex gap-2">
        <button
          disabled={saving}
          onClick={() => onAnswer('vou')}
          className={cn(
            'flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl border text-base font-semibold active:scale-[0.98]',
            vai ? 'border-brand-500 bg-brand-500 text-ink-950' : 'border-ink-700 bg-ink-800 text-ink-100',
          )}
        >
          <Check size={20} /> Vou
        </button>
        <button
          disabled={saving}
          onClick={() => onAnswer('nao_vou')}
          className={cn(
            'flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl border text-base font-semibold active:scale-[0.98]',
            situacao?.tipo === 'nao_vou'
              ? 'border-ink-400 bg-ink-600 text-ink-50'
              : 'border-ink-700 bg-ink-800 text-ink-100',
          )}
        >
          <X size={20} /> Não vou
        </button>
      </div>
      {convidado && vai && (
        <p className="mt-2 text-xs leading-relaxed text-ink-500">
          Se desistir e depois voltar, você vai para o fim da fila.
        </p>
      )}
    </div>
  );
}

function GuestLine({
  name,
  invitedBy,
  mine,
  children,
}: {
  name: string;
  invitedBy: string | null;
  mine: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border px-3 py-2.5',
        mine ? 'border-brand-500/60 bg-brand-500/10' : 'border-ink-800 bg-ink-900',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] text-ink-50">{name}</span>
        {invitedBy && (
          <span className="block truncate text-[11px] text-ink-500">convidado de {invitedBy}</span>
        )}
      </span>
      <span className="shrink-0">{children}</span>
    </div>
  );
}

export function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-12">
      <p className="safe-top pt-6 pb-4 text-sm font-bold tracking-tight text-ink-400">
        Time<span className="text-brand-400">Certo</span>
      </p>
      {children}
    </div>
  );
}
