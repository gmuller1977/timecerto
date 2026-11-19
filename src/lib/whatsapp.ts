/**
 * Abrir o WhatsApp com a mensagem pronta (a pessoa escolhe o contato ou grupo).
 *
 * Pedido do Guilherme em 19/11/2026: no Android com WhatsApp e WhatsApp
 * Business, o `wa.me` abria o Business (padrão do aparelho), mas o grupo da
 * pelada estava no comum. O app não tem como saber em qual dos dois está o
 * grupo, nem quais estão instalados. Então, no Android, abrimos o app pelo
 * pacote (intent do Chrome): o comum por padrão, o Business se a pessoa
 * escolher — e a escolha fica no aparelho. Se o app escolhido não estiver
 * instalado, o Chrome segue para o `wa.me` de sempre (browser_fallback_url).
 *
 * iPhone e computador: `wa.me` como antes (o iOS não deixa escolher o app).
 *
 * Vale para o app todo: no link a troca fica junto do botão; o administrador
 * escolhe em Ajustes › WhatsApp deste celular (só aparece no Android).
 */

export type QualWhatsApp = 'comum' | 'business';

const CHAVE = 'timecerto:whatsapp';
const PACOTE: Record<QualWhatsApp, string> = {
  comum: 'com.whatsapp',
  business: 'com.whatsapp.w4b',
};

export function ehAndroid(): boolean {
  return typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
}

export function whatsappPreferido(): QualWhatsApp {
  try {
    return localStorage.getItem(CHAVE) === 'business' ? 'business' : 'comum';
  } catch {
    return 'comum';
  }
}

export function lembrarWhatsapp(qual: QualWhatsApp) {
  try {
    localStorage.setItem(CHAVE, qual);
  } catch {
    /* navegação privada: vale só desta vez */
  }
}

/** Número brasileiro sem DDI ganha o 55 (mesma regra de `whatsappTo`). */
function comDdi(phone: string): string {
  const d = phone.replace(/\D/g, '');
  return d.length <= 11 ? `55${d}` : d;
}

/**
 * Abre o WhatsApp com o texto pronto — na conversa da pessoa, se vier o
 * telefone. No Android, no app escolhido (comum, se ninguém escolheu).
 */
export function abrirWhatsappComTexto(
  text: string,
  qual: QualWhatsApp = whatsappPreferido(),
  phone?: string | null,
) {
  const numero = phone ? comDdi(phone) : '';
  const waMe = `https://wa.me/${numero}?text=${encodeURIComponent(text)}`;
  if (!ehAndroid()) {
    window.open(waMe, '_blank', 'noopener');
    return;
  }
  const intent =
    `intent://send?${numero ? `phone=${numero}&` : ''}text=${encodeURIComponent(text)}` +
    `#Intent;scheme=whatsapp;package=${PACOTE[qual]};` +
    `S.browser_fallback_url=${encodeURIComponent(waMe)};end`;
  window.location.href = intent;
}
