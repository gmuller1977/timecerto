/**
 * O Supabase está configurado nesta versão, e há sessão salva neste aparelho?
 *
 * Existe para as telas do pacote principal (home, Jogo, Elenco) decidirem se
 * vale carregar o cliente do Supabase — são 200 kB, e o app abre no ginásio.
 * A chave abaixo é onde o cliente guarda a sessão: basta saber se ela existe.
 * Errar custa pouco (um convite a entrar, ou um carregamento à toa); quem
 * confere de verdade é o próprio cliente, depois de carregado.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;

export const isCloudAvailable = Boolean(supabaseUrl);

export function hasSavedSession(): boolean {
  if (!supabaseUrl) return false;
  try {
    const ref = new URL(supabaseUrl).hostname.split('.')[0];
    return localStorage.getItem(`sb-${ref}-auth-token`) !== null;
  } catch {
    return false;
  }
}
