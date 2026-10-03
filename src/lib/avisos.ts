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

/**
 * A inscrição foi feita com a chave desta versão do app? O par VAPID foi
 * trocado em 03/10/2026 (o antigo estava malformado nos segredos): inscrição
 * da chave velha não recebe nada — o serviço de push recusa a entrega.
 */
function daChaveAtual(s: PushSubscription): boolean {
  const k = s.options?.applicationServerKey;
  if (!k || !CHAVE) return true; // sem como saber: não mexe
  const a = new Uint8Array(k);
  const b = chaveEmBytes(CHAVE);
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** A inscrição deste aparelho, se já existe — sem pedir nada ao usuário */
export async function inscricaoAtual(): Promise<(InscricaoDeAviso & { chaveVelha: boolean }) | null> {
  if (!avisosDisponiveis()) return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  const s = await reg?.pushManager.getSubscription();
  return s ? { ...paraInscricao(s), chaveVelha: !daChaveAtual(s) } : null;
}

/**
 * Refaz com a chave nova a inscrição feita com a velha, sem perguntar nada: a
 * permissão já foi dada, então o navegador não pede toque. Devolve a nova e o
 * endereço antigo, para apagar no banco.
 */
export async function renovarInscricao(): Promise<{ nova: InscricaoDeAviso; antigo: string } | null> {
  if (!avisosDisponiveis() || Notification.permission !== 'granted') return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  const s = await reg?.pushManager.getSubscription();
  if (!reg || !s || daChaveAtual(s)) return null;
  const antigo = s.endpoint;
  await s.unsubscribe();
  const nova = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveEmBytes(CHAVE!) });
  return { nova: paraInscricao(nova), antigo };
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
  // Inscrição da chave velha não serve: reaproveitá-la deixava o "ativar de
  // novo" sem efeito nenhum
  let existente = await reg.pushManager.getSubscription();
  if (existente && !daChaveAtual(existente)) {
    await existente.unsubscribe();
    existente = null;
  }
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
