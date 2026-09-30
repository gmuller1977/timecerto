import { AGE_GROUPS, NAIPES } from '@/lib/pro';
import type { AgeGroup, Naipe } from '@/types';
import { cn } from '@/lib/utils';

const chip = (on: boolean) =>
  cn(
    'shrink-0 rounded-xl border px-3 py-2 text-sm font-medium',
    on ? 'border-brand-500 bg-brand-500/15 text-brand-300' : 'border-ink-800 bg-ink-950 text-ink-400',
  );

/**
 * Categoria e naipe do time (migração 024): escolhidos ao criar o grupo e
 * editáveis em Ajustes. Todo atleta novo nasce com eles.
 */
export function CategoriaENaipe({
  ageGroup,
  naipe,
  onChange,
}: {
  ageGroup: AgeGroup | null;
  naipe: Naipe | null;
  /** Só o que mudou: quem usa junta com o que já tinha */
  onChange: (v: { ageGroup?: AgeGroup | null; naipe?: Naipe | null }) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <span className="text-xs font-medium text-ink-400">Categoria</span>
        <div className="no-scrollbar mt-1 flex gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label="Categoria">
          {AGE_GROUPS.map((g) => (
            <button
              key={g.id}
              type="button"
              role="radio"
              aria-checked={ageGroup === g.id}
              onClick={() => onChange({ ageGroup: g.id })}
              className={chip(ageGroup === g.id)}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <span className="text-xs font-medium text-ink-400">Naipe</span>
        <div className="mt-1 flex gap-2" role="radiogroup" aria-label="Naipe">
          {NAIPES.map((n) => (
            <button
              key={n.id}
              type="button"
              role="radio"
              aria-checked={naipe === n.id}
              onClick={() => onChange({ naipe: n.id })}
              className={chip(naipe === n.id)}
            >
              {n.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
