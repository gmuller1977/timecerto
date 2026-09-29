import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/store/useAuth';

/**
 * Ajustes › Sair da conta. O app só abre com login (ExigeConta, em App.tsx),
 * então quem chega aqui está logado: a única ação da conta é sair — pedido do
 * Guilherme em 29/09/2026. Sair não apaga nada do aparelho; volta ao login.
 */
export function SairDaConta() {
  const session = useAuth((s) => s.session);
  const signOut = useAuth((s) => s.signOut);
  const navigate = useNavigate();
  if (!session) return null;

  async function sair() {
    if (!window.confirm('Sair da conta? Os dados continuam neste aparelho; para voltar, é só entrar de novo.')) return;
    await signOut();
    navigate('/entrar', { replace: true });
  }

  return (
    <button
      onClick={sair}
      className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-ink-800 bg-ink-900 px-4 py-3.5 text-left"
    >
      <LogOut size={18} className="shrink-0 text-ink-400" />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium text-ink-100">Sair da conta</span>
        {session.user.email && <span className="block truncate text-xs text-ink-500">{session.user.email}</span>}
      </span>
    </button>
  );
}
