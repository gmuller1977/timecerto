import type { AgeGroup, Naipe, Player, ProPlayer } from '@/types';

export const AGE_GROUPS: { id: AgeGroup; label: string; /** idade máxima no ano */ maxAge?: number }[] = [
  { id: 'sub13', label: 'Sub-13', maxAge: 12 },
  { id: 'sub15', label: 'Sub-15', maxAge: 14 },
  { id: 'sub17', label: 'Sub-17', maxAge: 16 },
  { id: 'sub19', label: 'Sub-19', maxAge: 18 },
  { id: 'sub21', label: 'Sub-21', maxAge: 20 },
  { id: 'adulto', label: 'Adulto' },
  { id: 'master', label: 'Master' },
];

export const AGE_GROUP_LABEL = Object.fromEntries(
  AGE_GROUPS.map((g) => [g.id, g.label]),
) as Record<AgeGroup, string>;

export const NAIPES: { id: Naipe; label: string }[] = [
  { id: 'feminino', label: 'Feminino' },
  { id: 'masculino', label: 'Masculino' },
  { id: 'misto', label: 'Misto' },
];

export const NAIPE_LABEL = Object.fromEntries(
  NAIPES.map((n) => [n.id, n.label]),
) as Record<Naipe, string>;

/** Idade completa hoje, a partir de AAAA-MM-DD */
export function ageOn(birthDate: string, today = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = today.getFullYear() - y;
  const before =
    today.getMonth() + 1 < mo || (today.getMonth() + 1 === mo && today.getDate() < d);
  if (before) age--;
  return age >= 0 ? age : null;
}

/**
 * Faixa sugerida pelo ANO de nascimento, que é como as federações contam:
 * vale a idade que o atleta completa no ano, não a de hoje. Master não é
 * sugerido — é escolha de quem compete nele, não consequência da idade.
 */
export function suggestAgeGroup(birthDate: string, year = new Date().getFullYear()): AgeGroup | null {
  const by = Number(birthDate.slice(0, 4));
  if (!by || by > year) return null;
  const ageInYear = year - by;
  return AGE_GROUPS.find((g) => g.maxAge !== undefined && ageInYear <= g.maxAge)?.id ?? 'adulto';
}

/**
 * O placar, o scout e as estatísticas falam `Player`. O atleta profissional
 * entra neles por esta porta, sem que essas telas precisem saber de modo.
 */
export function proToPlayer(p: ProPlayer): Player {
  return {
    id: p.id,
    name: p.name,
    skills: {},
    positions: p.position ? { volei: p.position } : {},
    createdAt: p.createdAt,
  };
}

/** "1,85 m · 78 kg" — só o que foi preenchido */
export function bodyLine(p: ProPlayer): string {
  const parts: string[] = [];
  if (p.heightCm) parts.push(`${(p.heightCm / 100).toFixed(2).replace('.', ',')} m`);
  if (p.weightKg) parts.push(`${String(p.weightKg).replace('.', ',')} kg`);
  return parts.join(' · ');
}
