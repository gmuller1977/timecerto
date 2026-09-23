import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarPlus,
  Check,
  Copy,
  LogOut,
  MessageCircle,
  RefreshCw,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/store/useAppStore';
import { useProStore } from '@/store/useProStore';
import { useAuth } from '@/store/useAuth';
import { useHydrated } from '@/store/useHydrated';
import { isSupabaseConfigured } from '@/lib/supabase';
import {
  athleteLink,
  closeEvent,
  createEvent,
  createGroup,
  fetchAttendance,
  findMyGroup,
  groupLink,
  openEvent,
  shareOnWhatsApp,
  syncAmador,
  syncPro,
  type Attendance,
  type CloudEvent,
  type CloudGroup,
} from '@/lib/cloud';
import type { AppMode } from '@/types';
import { cn } from '@/lib/utils';

const fmtEvent = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * Mensagem legível para o organizador. O código técnico vai junto, entre
 * parênteses: é o que permite diagnosticar pelo print, sem abrir o console.
 */
function explain(e: unknown): string {
  console.error('convites', e);
  if (!navigator.onLine) {
    return 'Sem internet. Os convites precisam de conexão — o resto do app funciona normal.';
  }
  const err = e as { code?: string; message?: string };
  const detail = err?.code || err?.message;
  return `Algo deu errado ao falar com o servidor. Tente de novo.${detail ? ` (${detail})` : ''}`;
}

export function InvitePage() {
  const navigate = useNavigate();
  const hydrated = useHydrated();
  const ready = useAuth((s) => s.ready);
  const session = useAuth((s) => s.session);
  const signOut = useAuth((s) => s.signOut);
  const mode: AppMode = useAppStore((s) => s.mode) ?? 'amador';
  const back = mode === 'profissional' ? '/profissional' : '/amador';

  const header = (
    <header className="safe-top flex items-center gap-3 pt-6 pb-4">
      <button onClick={() => navigate(back)} className="p-1 text-ink-400" aria-label="Voltar">
        <ArrowLeft size={22} />
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-bold">Convites</h1>
        <p className="truncate text-xs text-ink-400">
          {mode === 'profissional'
            ? 'Cada atleta completa o próprio cadastro'
            : 'O grupo confirma presença pelo WhatsApp'}
        </p>
      </div>
      {session && (
        <button
          onClick={() => {
            if (window.confirm('Sair da conta? Os dados do aparelho continuam aqui.')) signOut();
          }}
          className="p-1.5 text-ink-500"
          aria-label="Sair da conta"
        >
          <LogOut size={19} />
        </button>
      )}
    </header>
  );

  if (!hydrated || !ready) return null;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-16">
      {header}
      {!isSupabaseConfigured ? (
        <p className="text-sm text-ink-400">Convites ainda não estão disponíveis nesta versão.</p>
      ) : !session ? (
        <div className="mt-6 rounded-2xl border border-ink-800 bg-ink-900 p-5">
          <p className="text-[15px] font-semibold text-ink-50">Entre para convidar</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-400">
            Só quem organiza precisa de conta.{' '}
            {mode === 'profissional'
              ? 'Os atletas recebem um link pessoal e não criam nada.'
              : 'O grupo recebe um link e responde sem criar nada.'}
          </p>
          <Button
            size="lg"
            className="mt-4 w-full"
            onClick={() => navigate('/entrar?volta=/convites')}
          >
            Entrar com Google
          </Button>
        </div>
      ) : (
        <Connected mode={mode} email={session.user.email ?? ''} />
      )}
    </div>
  );
}

function Connected({ mode, email }: { mode: AppMode; email: string }) {
  const [group, setGroup] = useState<CloudGroup | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(mode === 'profissional' ? 'Meu time' : 'Pelada');
  // Quantos chegaram ao cadastro pelo link desde a última abertura
  const [linkAdded, setLinkAdded] = useState(0);

  const sync = useCallback(
    async (g: CloudGroup) => {
      if (mode === 'profissional') return syncPro(g.id);
      const n = await syncAmador(g.id);
      if (n > 0) setLinkAdded(n);
    },
    [mode],
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const g = await findMyGroup(mode);
        if (g) await sync(g);
        if (alive) setGroup(g);
      } catch (e) {
        if (alive) {
          setError(explain(e));
          setGroup(null);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [mode, sync]);

  async function handleCreate() {
    setBusy(true);
    setError(null);
    try {
      const g = await createGroup(mode, name || 'Meu grupo');
      await sync(g);
      setGroup(g);
    } catch (e) {
      setError(explain(e));
    }
    setBusy(false);
  }

  if (group === undefined) {
    return <p className="mt-8 text-center text-sm text-ink-500">Carregando…</p>;
  }

  return (
    <>
      <p className="mb-3 text-xs text-ink-500">Conectado como {email}</p>
      {linkAdded > 0 && (
        <p className="mb-3 rounded-xl border border-brand-500/30 bg-brand-500/10 px-3 py-2.5 text-sm leading-relaxed text-brand-200">
          {linkAdded === 1
            ? '1 pessoa entrou pelo link e já está no seu cadastro'
            : `${linkAdded} pessoas entraram pelo link e já estão no seu cadastro`}{' '}
          com nível 3. Ajuste nível e posição antes de sortear.
        </p>
      )}
      {error && (
        <p className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300">
          {error}
        </p>
      )}
      {!group ? (
        <div className="rounded-2xl border border-ink-800 bg-ink-900 p-5">
          <p className="text-[15px] font-semibold text-ink-50">
            {mode === 'profissional' ? 'Crie o seu time' : 'Crie o seu grupo'}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink-400">
            {mode === 'profissional'
              ? 'O elenco deste aparelho vai junto, e cada atleta ganha um link pessoal.'
              : 'Os jogadores deste aparelho vão junto, e o grupo ganha um link para o WhatsApp.'}{' '}
            Nada sai do aparelho: a nuvem recebe uma cópia.
          </p>
          <label className="mt-4 block text-xs font-medium text-ink-400">Nome</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-xl bg-ink-800 px-3 py-3 text-[15px] text-ink-50 outline-none"
          />
          <Button size="lg" className="mt-4 w-full" disabled={busy} onClick={handleCreate}>
            {busy ? 'Criando…' : 'Criar e gerar convites'}
          </Button>
        </div>
      ) : mode === 'profissional' ? (
        <ProInvites group={group} onError={setError} />
      ) : (
        <AmadorInvites group={group} onError={setError} />
      )}
    </>
  );
}

// ── Amador: link do grupo + presença do próximo jogo ────────

function AmadorInvites({ group, onError }: { group: CloudGroup; onError: (m: string) => void }) {
  const players = useAppStore((s) => s.players);
  const updatePlayer = useAppStore((s) => s.updatePlayer);
  const [event, setEvent] = useState<CloudEvent | null | undefined>(undefined);
  const [answers, setAnswers] = useState<Attendance>({});
  const [when, setWhen] = useState(defaultWhen);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [applied, setApplied] = useState(false);

  const link = groupLink(group.code);

  const load = useCallback(async () => {
    try {
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

  async function handleCreateEvent() {
    setBusy(true);
    try {
      await createEvent(group.id, new Date(when), title);
      await load();
    } catch (e) {
      onError(explain(e));
    }
    setBusy(false);
  }

  function share() {
    const quando = event ? `\n📅 ${fmtEvent(event.startsAt)}` : '';
    shareOnWhatsApp(
      `⚡ ${event?.title || group.name}${quando}\n\nConfirme se vai: toque no link, escolha seu nome e marque.\n${link}`,
    );
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copie o link:', link);
    }
  }

  // As respostas do link viram a lista de presença do sorteio
  function applyToPresence() {
    for (const p of players) {
      const a = p.remoteId ? answers[p.remoteId] : undefined;
      if (a) updatePlayer(p.id, { present: a === 'vou' });
    }
    setApplied(true);
    setTimeout(() => setApplied(false), 2500);
  }

  const vou = players.filter((p) => p.remoteId && answers[p.remoteId] === 'vou');
  const naoVou = players.filter((p) => p.remoteId && answers[p.remoteId] === 'nao_vou');
  const semResposta = players.filter((p) => !p.remoteId || !answers[p.remoteId]);

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border border-ink-800 bg-ink-900 p-4">
        <p className="text-xs font-semibold tracking-wide text-brand-400 uppercase">
          Próximo jogo
        </p>
        {event === undefined ? (
          <p className="mt-2 text-sm text-ink-500">Carregando…</p>
        ) : event ? (
          <>
            <p className="mt-1 text-[17px] font-semibold text-ink-50">
              {event.title || group.name}
            </p>
            <p className="text-sm capitalize text-ink-300">{fmtEvent(event.startsAt)}</p>
            <div className="mt-4 flex gap-2">
              <Button size="lg" className="flex-1" onClick={share}>
                <MessageCircle size={19} />
                Enviar no WhatsApp
              </Button>
              <Button variant="secondary" size="lg" onClick={copy} aria-label="Copiar link">
                {copied ? <Check size={19} /> : <Copy size={19} />}
              </Button>
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-ink-400">
            Marque o jogo para o grupo responder. O link é sempre o mesmo — ele
            mostra o jogo que estiver aberto.
          </p>
        )}

        <details className="mt-4 group" open={event === null}>
          <summary className="cursor-pointer list-none text-sm font-medium text-brand-400">
            <CalendarPlus size={15} className="mr-1.5 inline" />
            {event ? 'Marcar outro jogo' : 'Marcar jogo'}
          </summary>
          <div className="mt-3 flex flex-col gap-2">
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="w-full rounded-xl bg-ink-800 px-3 py-3 text-[15px] text-ink-50 outline-none [color-scheme:dark]"
            />
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título (opcional) — ex.: Pelada de quinta"
              className="w-full rounded-xl bg-ink-800 px-3 py-3 text-[15px] text-ink-50 placeholder:text-ink-500 outline-none"
            />
            <Button variant="secondary" disabled={busy || !when} onClick={handleCreateEvent}>
              {busy ? 'Salvando…' : event ? 'Trocar pelo novo jogo' : 'Marcar'}
            </Button>
            {event && (
              <p className="text-[11px] leading-relaxed text-ink-500">
                O jogo atual fecha e as respostas dele ficam guardadas.
              </p>
            )}
          </div>
        </details>
      </section>

      {event && (
        <section className="rounded-2xl border border-ink-800 bg-ink-900 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-ink-100">
              {vou.length} vão · {naoVou.length} não vão · {semResposta.length} sem resposta
            </p>
            <button onClick={load} className="p-1 text-ink-500" aria-label="Atualizar respostas">
              <RefreshCw size={16} />
            </button>
          </div>

          <NameList label="Vão" tone="ok" names={vou.map((p) => p.name)} />
          <NameList label="Não vão" tone="no" names={naoVou.map((p) => p.name)} />
          <NameList label="Sem resposta" tone="none" names={semResposta.map((p) => p.name)} />

          <Button
            variant="secondary"
            className="mt-4 w-full"
            disabled={vou.length + naoVou.length === 0}
            onClick={applyToPresence}
          >
            {applied ? <Check size={17} /> : null}
            {applied ? 'Lista de presença atualizada' : 'Usar respostas na lista de presença'}
          </Button>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
            Quem respondeu entra ou sai da lista do sorteio. Quem não respondeu fica
            como está.
          </p>
          <button
            onClick={async () => {
              if (!window.confirm('Fechar as respostas? O link deixa de aceitar confirmações.')) return;
              try {
                await closeEvent(event.id);
                await load();
              } catch (e) {
                onError(explain(e));
              }
            }}
            className="mt-3 text-xs text-ink-500 underline"
          >
            Fechar respostas deste jogo
          </button>
        </section>
      )}
    </div>
  );
}

function NameList({ label, tone, names }: { label: string; tone: 'ok' | 'no' | 'none'; names: string[] }) {
  if (names.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {names.map((n) => (
          <span
            key={n}
            className={cn(
              'flex items-center gap-1 rounded-lg px-2 py-1 text-xs',
              tone === 'ok' && 'bg-brand-500/15 text-brand-200',
              tone === 'no' && 'bg-ink-800 text-ink-400 line-through',
              tone === 'none' && 'border border-ink-800 text-ink-400',
            )}
          >
            {tone === 'ok' && <Check size={12} />}
            {tone === 'no' && <X size={12} />}
            {n}
          </span>
        ))}
      </div>
    </div>
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

// ── Profissional: link pessoal por atleta ───────────────────

function ProInvites({ group, onError }: { group: CloudGroup; onError: (m: string) => void }) {
  const players = useProStore((s) => s.players);
  const [busy, setBusy] = useState(false);

  const sorted = [...players].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const missing = (p: (typeof players)[number]) =>
    [!p.birthDate && 'nascimento', !p.heightCm && 'altura', !p.weightKg && 'peso'].filter(
      Boolean,
    ) as string[];
  const complete = sorted.filter((p) => missing(p).length === 0).length;

  async function refresh() {
    setBusy(true);
    try {
      await syncPro(group.id);
    } catch (e) {
      onError(explain(e));
    }
    setBusy(false);
  }

  return (
    <section className="rounded-2xl border border-ink-800 bg-ink-900 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-ink-50">{group.name}</p>
          <p className="text-xs text-ink-400">
            {complete} de {sorted.length} com cadastro completo
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={busy}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-ink-800 px-3 py-2 text-xs font-medium text-ink-300 disabled:opacity-50"
        >
          <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
          Trazer dados
        </button>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
        Cada atleta recebe um link só dele para preencher nascimento, altura e peso.
        Nome, categoria e posição continuam com você.
      </p>

      <div className="mt-3 flex flex-col gap-2">
        {sorted.map((p) => {
          const falta = missing(p);
          return (
            <div
              key={p.id}
              className="flex items-center gap-2 rounded-xl border border-ink-800 bg-ink-950 px-3 py-2.5"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium text-ink-50">{p.name}</span>
                <span
                  className={cn(
                    'block truncate text-xs',
                    falta.length ? 'text-ink-500' : 'text-brand-300',
                  )}
                >
                  {falta.length ? `Falta ${falta.join(', ')}` : 'Cadastro completo'}
                </span>
              </span>
              <button
                disabled={!p.inviteToken}
                onClick={() =>
                  shareOnWhatsApp(
                    `Olá, ${p.name.split(' ')[0]}! Complete seu cadastro no ${group.name} — leva um minuto:\n${athleteLink(p.inviteToken!)}`,
                  )
                }
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-500/15 px-3 py-2 text-xs font-semibold text-brand-300 disabled:opacity-40"
              >
                <MessageCircle size={14} />
                Enviar
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
