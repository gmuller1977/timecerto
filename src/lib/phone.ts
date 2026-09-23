/**
 * Telefone guardado só com dígitos (DDD + número), formatado só na tela.
 * O banco confere o mesmo formato (10 a 13 dígitos): o que passa aqui,
 * passa lá — senão a sincronização inteira falharia por um telefone.
 */

export function onlyDigits(s: string): string {
  return s.replace(/\D/g, '');
}

export function isValidPhone(digits: string): boolean {
  return /^[0-9]{10,13}$/.test(digits);
}

/** (11) 98765-4321 · (11) 3456-7890 · com código do país, sem máscara */
export function formatPhone(digits: string): string {
  const d = onlyDigits(digits);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

/** Máscara enquanto digita, sem travar quem cola número com +55 */
export function maskPhoneInput(raw: string): string {
  const d = onlyDigits(raw).slice(0, 13);
  if (d.length > 11) return d;
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Conversa no WhatsApp com a pessoa. Número brasileiro sem DDI ganha o 55. */
export function whatsappTo(digits: string): string {
  const d = onlyDigits(digits);
  return `https://wa.me/${d.length <= 11 ? `55${d}` : d}`;
}
