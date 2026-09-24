import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, LogOut, MessageCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/store/useAppStore';
import { useProStore } from '@/store/useProStore';
import { useAuth } from '@/store/useAuth';
import { useHydrated } from '@/store/useHydrated';
import { isSupabaseConfigured } from '@/lib/supabase';
import { athleteLink, createGroup, findMyGroup, shareOnWhatsApp, syncPro, type CloudGroup } from '@/lib/cloud';
import { explain } from '@/components/cloud/partes';
import { cn } from '@/lib/utils';

/**
 * Convites do modo PROFISSIONAL: um link pessoal por atleta, para ele
 * completar nascimento, altura e peso.
 *
 * O modo amador não passa mais por aqui (docs/telas-amador.md, etapa 3): o
 * jogo da semana e os convites dele estão no cartão da aba Jogo, e o link de
 * cadastro e os pendentes, no Elenco. `/convites` no amador leva ao Jogo, para
 * favorito antigo e retorno do login não caírem numa tela vazia.
 */
export function InvitePage() {
  const navigate = useNavigate();
  const hydrated = useHydrated();
  const ready = useAuth((s) => s.ready);
  const session = useAuth((s) => s.session);
  const signOut = useAuth((s) => s.signOut);
  const mode = useAppStore((s) => s.mode) ?? 'amador';

  if (!hydrated || !ready) return null;
  if (mode !== 'profissional') return <Navigate to="/amador" replace />;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-16">
      <header className="safe-top flex items-center gap-3 pt-6 pb-4">
        <button onClick={() => navigate('/profissional')} className="p-1 text-ink-400" aria-label="Voltar">
          <ArrowLeft size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold">Convites</h1>
          <p className="truncate text-xs text-ink-400">Cada atleta completa o próprio cadastro</p>
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
      {!isSupabaseConfigured ? (
        <p className="text-sm text-ink-400">Convites ainda não estão disponíveis nesta versão.</p>
      ) : !session ? (
        <div className="mt-6 rounded-2xl border border-ink-800 bg-ink-900 p-5">
          <p className="text-[15px] font-semibold text-ink-50">Entre para convidar</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-400">
            Só quem organiza precisa de conta. Os atletas recebem um link pessoal e não
            criam nada.
          </p>
          <Button size="lg" className="mt-4 w-full" onClick={() => navigate('/entrar?volta=/convites')}>
            Entrar com Google
          </Button>
        </div>
      ) : (
        <Connected email={session.user.email ?? ''} />
      )}
    </div>
  );
}

function Connected({ email }: { email: string }) {
  const [group, setGroup] = useState<CloudGroup | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('Meu time');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const g = await findMyGroup('profissional');
        if (g) await syncPro(g.id);
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
  }, []);

  async function handleCreate() {
    setBusy(true);
    setError(null);
    try {
      const g = await createGroup('profissional', name || 'Meu grupo');
      await syncPro(g.id);
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
      {error && (
        <p className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300">
          {error}
        </p>
      )}
      {!group ? (
        <div className="rounded-2xl border border-ink-800 bg-ink-900 p-5">
          <p className="text-[15px] font-semibold text-ink-50">Crie o seu time</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-400">
            O elenco deste aparelho vai junto, e cada atleta ganha um link pessoal. Nada
            sai do aparelho: a nuvem recebe uma cópia.
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
      ) : (
        <ProInvites group={group} onError={setError} />
      )}
    </>
  );
}

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
