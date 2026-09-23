import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface AuthState {
  session: Session | null;
  /** A sessão salva já foi lida. Antes disso, "sem sessão" não quer dizer nada */
  ready: boolean;
  signInWithGoogle: (volta?: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

/**
 * Sessão do organizador. Não é persistida por nós — o cliente do Supabase já
 * guarda a sessão no localStorage; aqui só espelhamos para o React.
 *
 * Mesma regra do useHydrated: não redirecione enquanto `ready` for falso.
 */
export const useAuth = create<AuthState>()((set) => ({
  session: null,
  ready: !supabase,

  /**
   * Sai do app para o Google e volta em `#/entrar`, a tela que carrega o
   * cliente do Supabase e troca o ?code= pela sessão. `volta` é para onde ir
   * depois. Devolve a mensagem de erro, ou null quando o redirecionamento saiu.
   */
  signInWithGoogle: async (volta) => {
    if (!supabase) return 'Login indisponível nesta versão.';
    const back = volta ? `?volta=${encodeURIComponent(volta)}` : '';
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${location.origin}${location.pathname}#/entrar${back}`,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) {
      console.error('login google', error);
      return 'Não foi possível abrir o login do Google. Tente de novo.';
    }
    return null;
  },

  signOut: async () => {
    await supabase?.auth.signOut();
    set({ session: null });
  },
}));

/** Tira ?code= e ?error= da barra de endereço depois do retorno do Google */
function cleanAuthParams() {
  const u = new URL(location.href);
  let changed = false;
  for (const k of ['code', 'error', 'error_code', 'error_description']) {
    if (u.searchParams.has(k)) {
      u.searchParams.delete(k);
      changed = true;
    }
  }
  if (changed) history.replaceState(history.state, '', u.toString());
}

/** Erro devolvido pelo Google/Supabase na volta, lido antes da limpeza */
export const oauthError: string | null = new URLSearchParams(location.search).get(
  'error_description',
);

if (supabase) {
  supabase.auth.getSession().then(({ data }) => {
    useAuth.setState({ session: data.session, ready: true });
    cleanAuthParams();
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    useAuth.setState({ session, ready: true });
  });
}
