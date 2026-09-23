import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { oauthError, useAuth } from '@/store/useAuth';

/**
 * Login do administrador (amador) e do técnico (profissional), pela conta
 * Google. Jogador e atleta não passam por aqui — entram pelo link do
 * WhatsApp, sem conta.
 *
 * É também a tela para onde o Google devolve a pessoa (`#/entrar?code=`):
 * carregar esta tela carrega o cliente do Supabase, que troca o código pela
 * sessão.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const volta = params.get('volta');
  const session = useAuth((s) => s.session);
  const ready = useAuth((s) => s.ready);
  const signInWithGoogle = useAuth((s) => s.signInWithGoogle);
  const signOut = useAuth((s) => s.signOut);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    oauthError ? 'O login com o Google não foi concluído. Tente de novo.' : null,
  );

  if (!supabase) {
    return (
      <Shell onBack={() => navigate('/')}>
        <p className="text-sm leading-relaxed text-ink-400">
          O login ainda não está disponível nesta versão do app.
        </p>
      </Shell>
    );
  }
  if (!ready) return null;
  // Veio de uma tela que pediu login: devolve para ela
  if (session && volta) return <Navigate to={volta} replace />;

  if (session) {
    const meta = session.user.user_metadata as { full_name?: string; avatar_url?: string };
    return (
      <Shell onBack={() => navigate('/')}>
        <div className="flex items-center gap-3 rounded-2xl border border-ink-800 bg-ink-900 p-4">
          {meta.avatar_url && (
            <img
              src={meta.avatar_url}
              alt=""
              referrerPolicy="no-referrer"
              className="size-11 shrink-0 rounded-full"
            />
          )}
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-ink-50">
              {meta.full_name ?? 'Conectado'}
            </p>
            <p className="truncate text-xs text-ink-400">{session.user.email}</p>
          </div>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-ink-400">
          Os convites ficam dentro de cada modo — no Amador ou no Profissional,
          toque em Convidar.
        </p>
        <Button
          variant="secondary"
          size="lg"
          className="mt-5 w-full"
          onClick={async () => {
            await signOut();
            navigate('/', { replace: true });
          }}
        >
          <LogOut size={18} />
          Sair da conta
        </Button>
        <p className="mt-3 text-center text-xs leading-relaxed text-ink-500">
          Sair não apaga nada: jogadores e partidas continuam neste aparelho.
        </p>
      </Shell>
    );
  }

  async function google() {
    setBusy(true);
    setError(null);
    const err = await signInWithGoogle(volta ?? undefined);
    // Sem erro, o navegador já está saindo para o Google
    if (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <Shell onBack={() => navigate(-1)}>
      <p className="text-sm leading-relaxed text-ink-400">
        Para administradores de pelada e técnicos. Com a conta você convida pelo
        WhatsApp e acompanha quem confirmou.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-ink-400">
        Jogadores e atletas não precisam de conta — eles entram pelo link que você
        manda.
      </p>

      {error && <p className="mt-5 text-sm text-red-300">{error}</p>}

      <button
        onClick={google}
        disabled={busy}
        className="mt-6 flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-white px-6 text-base font-semibold text-[#1f1f1f] active:scale-[0.98] disabled:opacity-60"
      >
        <GoogleLogo />
        {busy ? 'Abrindo o Google…' : 'Entrar com Google'}
      </button>
    </Shell>
  );
}

/** Logo oficial do Google — as cores fazem parte da marca, não do tema */
function GoogleLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function Shell({ children, onBack }: { children: React.ReactNode; onBack: () => void }) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-10">
      <header className="safe-top flex items-center gap-3 pt-6 pb-6">
        <button onClick={onBack} className="p-1 text-ink-400" aria-label="Voltar">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-2xl font-bold tracking-tight">
          Entrar no Time<span className="text-brand-400">Certo</span>
        </h1>
      </header>
      {children}
    </div>
  );
}
