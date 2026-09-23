import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * O app continua funcionando 100% offline (localStorage). O Supabase entra
 * para login do organizador, convites e confirmação de presença. Sem as
 * variáveis, `supabase` é `null` e o resto do app segue igual.
 */
export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // O login é por código digitado, não por link. E o app usa HashRouter:
        // deixar o cliente ler tokens do # da URL brigaria com as rotas.
        detectSessionInUrl: false,
      },
    })
  : null;
