import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, LogOut, Mail } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/store/useAuth';

/**
 * Login do organizador e do técnico, por código de 6 dígitos no e-mail.
 * Código e não link: o link do e-mail abre no navegador, e o app instalado
 * (PWA) ficaria de fora. Jogador e atleta não passam por aqui — entram pelo
 * link do WhatsApp, sem conta.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const back = params.get('volta') || '/';
  const session = useAuth((s) => s.session);
  const ready = useAuth((s) => s.ready);
  const signOut = useAuth((s) => s.signOut);

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  if (session && params.get('volta')) return <Navigate to={back} replace />;
  // Veio pelo botão da home: mostra a conta
  if (session) {
    return (
      <Shell onBack={() => navigate('/')}>
        <div className="rounded-2xl border border-ink-800 bg-ink-900 p-5">
          <p className="text-xs text-ink-500">Conectado como</p>
          <p className="mt-0.5 truncate text-[15px] font-semibold text-ink-50">
            {session.user.email}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-ink-400">
            Os convites ficam dentro de cada modo — no Amador ou no Profissional,
            toque em Convidar.
          </p>
        </div>
        <Button
          variant="secondary"
          size="lg"
          className="mt-4 w-full"
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

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    const addr = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(addr)) return setError('Confira o e-mail.');
    setBusy(true);
    setError(null);
    const { error } = await supabase!.auth.signInWithOtp({
      email: addr,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) {
      console.error('login: envio do código', error);
      return setError(
        error.status === 429
          ? 'Muitas tentativas. Espere alguns minutos e tente de novo.'
          : 'Não foi possível enviar o código. Tente de novo.',
      );
    }
    setEmail(addr);
    setStep('code');
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    const token = code.replace(/\D/g, '');
    if (token.length < 6) return setError('O código tem 6 dígitos.');
    setBusy(true);
    setError(null);
    const { error } = await supabase!.auth.verifyOtp({ email, token, type: 'email' });
    setBusy(false);
    if (error) {
      console.error('login: verificação', error);
      return setError('Código inválido ou vencido. Confira ou peça outro.');
    }
    navigate(back, { replace: true });
  }

  return (
    <Shell onBack={() => (step === 'code' ? setStep('email') : navigate(-1))}>
      {step === 'email' ? (
        <form onSubmit={sendCode}>
          <p className="text-sm leading-relaxed text-ink-400">
            Para organizadores e técnicos. Com a conta você convida o grupo pelo
            WhatsApp e acompanha quem confirmou.
          </p>
          <label className="mt-6 block text-xs font-medium text-ink-400">E-mail</label>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@email.com"
            className="mt-1 w-full rounded-xl bg-ink-800 px-3 py-3.5 text-[16px] text-ink-50 placeholder:text-ink-500 outline-none"
          />
          {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
          <Button type="submit" size="lg" className="mt-5 w-full" disabled={busy}>
            <Mail size={18} />
            {busy ? 'Enviando…' : 'Receber código'}
          </Button>
          <p className="mt-4 text-center text-xs leading-relaxed text-ink-500">
            Sem senha. A cada login chega um código novo no e-mail.
          </p>
        </form>
      ) : (
        <form onSubmit={verify}>
          <p className="text-sm leading-relaxed text-ink-400">
            Enviamos um código para <span className="text-ink-100">{email}</span>.
            Se não chegar em um minuto, olhe o spam.
          </p>
          <label className="mt-6 block text-xs font-medium text-ink-400">Código</label>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={10}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="000000"
            className="mt-1 w-full rounded-xl bg-ink-800 px-3 py-3.5 text-center text-2xl font-semibold tracking-[0.4em] text-ink-50 placeholder:text-ink-600 outline-none"
          />
          {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
          <Button type="submit" size="lg" className="mt-5 w-full" disabled={busy}>
            {busy ? 'Conferindo…' : 'Entrar'}
          </Button>
          <button
            type="button"
            onClick={() => {
              setCode('');
              setStep('email');
            }}
            className="mt-3 w-full py-2 text-sm text-ink-400"
          >
            Usar outro e-mail ou pedir outro código
          </button>
        </form>
      )}
    </Shell>
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
