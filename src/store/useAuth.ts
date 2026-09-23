import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface AuthState {
  session: Session | null;
  /** A sessão salva já foi lida. Antes disso, "sem sessão" não quer dizer nada */
  ready: boolean;
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
  signOut: async () => {
    await supabase?.auth.signOut();
    set({ session: null });
  },
}));

if (supabase) {
  supabase.auth.getSession().then(({ data }) => {
    useAuth.setState({ session: data.session, ready: true });
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    useAuth.setState({ session, ready: true });
  });
}
