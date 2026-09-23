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
        // Login pelo Google volta com ?code= na URL (PKCE). O PKCE usa a query,
        // não o #, então não briga com o HashRouter — o # continua sendo a rota.
        flowType: 'pkce',
        detectSessionInUrl: true,
      },
    })
  : null;
