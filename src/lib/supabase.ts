import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Fase 1 do TimeCerto funciona 100% offline (localStorage).
 * O Supabase entra na fase 2: contas, grupos compartilhados,
 * confirmação de presença e financeiro do grupo.
 */
export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = isSupabaseConfigured
  ? createClient(url!, anonKey!)
  : null;
