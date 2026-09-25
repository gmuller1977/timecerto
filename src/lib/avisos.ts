/**
 * Avisos no celular (web push, migração 016) — a parte do navegador: pedir
 * permissão, registrar o service worker (`public/sw.js`) e gerar a inscrição
 * que vai para o banco. Quem entrega é a Edge Function `enviar-aviso`.
 *
 * A chave pública VAPID vem de `VITE_VAPID_PUBLIC_KEY`. Ela é pública por
 * natureza (vai para o navegador de qualquer forma); a privada fica só nos
 * segredos do Supabase. Sem a chave, os avisos simplesmente não aparecem.
 */

const CHAVE = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

/** Esta versão do app foi publicada com a chave — sem ela, nada de avisos aparece */
export function avisosConfigurados(): boolean {
  return Boolean(CHAVE);
}

/** O navegador sabe receber avisos, e esta versão do app tem a chave */
export function avisosDisponiveis(): boolean {
  return (
    Boolean(CHAVE) &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * iPhone com o site no Safari: a Apple só entrega aviso ao site instalado na
 * tela de início. Nesse caso vale explicar como instalar em vez de esconder.
 */
export function iphoneSemInstalar(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const instalado =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches;
  return ios && !instalado;
}

/** A permissão foi negada: só o próprio usuário desfaz, nos ajustes do navegador */
export function avisosBloqueados(): boolean {
  return typeof Notification !== 'undefined' && Notification.permission === 'denied';
}

export interface InscricaoDeAviso {
  endpoint: string;
  p256dh: string;
  auth: string;
}

function paraInscricao(s: PushSubscription): InscricaoDeAviso {
  const json = s.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  return { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth };
}

function chaveEmBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const bin = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function registro(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register('/sw.js');
  return navigator.serviceWorker.ready.then(() => reg);
}

/** A inscrição deste aparelho, se já existe — sem pedir nada ao usuário */
export async function inscricaoAtual(): Promise<InscricaoDeAviso | null> {
  if (!avisosDisponiveis()) return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  const s = await reg?.pushManager.getSubscription();
  return s ? paraInscricao(s) : null;
}

/**
 * Pede a permissão e inscreve este aparelho. Precisa vir de um toque do
 * usuário: fora dele o navegador recusa o pedido de permissão.
 */
export async function ativarAvisos(): Promise<InscricaoDeAviso> {
  if (!avisosDisponiveis()) throw new Error('Este navegador não recebe avisos.');
  const permissao = await Notification.requestPermission();
  if (permissao !== 'granted') {
    throw new Error(
      permissao === 'denied'
        ? 'Os avisos foram bloqueados. Libere as notificações deste site nos ajustes do navegador.'
        : 'Sem permissão para avisar.',
    );
  }
  const reg = await registro();
  const existente = await reg.pushManager.getSubscription();
  const s =
    existente ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveEmBytes(CHAVE!) }));
  return paraInscricao(s);
}

/** Cancela neste aparelho. Devolve o endereço, para apagar também no banco */
export async function desativarAvisos(): Promise<string | null> {
  const reg = await navigator.serviceWorker.getRegistration('/');
  const s = await reg?.pushManager.getSubscription();
  if (!s) return null;
  const endpoint = s.endpoint;
  await s.unsubscribe();
  return endpoint;
}
