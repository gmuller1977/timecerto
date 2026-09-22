import { cn } from '@/lib/utils';

export interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
}

/**
 * Barra empilhada horizontal. Marcas finas, cantos de 4px nas pontas de dado
 * e 2px de respiro entre segmentos — o vão é o que separa duas cores
 * adjacentes para quem não distingue bem matiz.
 */
export function StackedBar({ slices }: { slices: Slice[] }) {
  const data = slices.filter((s) => s.value > 0);
  const total = data.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) {
    return <p className="text-xs text-ink-600">Sem dados classificados.</p>;
  }

  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden">
        {data.map((s, i) => (
          <div
            key={s.key}
            title={`${s.label}: ${s.value}`}
            style={{
              width: `${(s.value / total) * 100}%`,
              background: s.color,
              borderTopLeftRadius: i === 0 ? 4 : 0,
              borderBottomLeftRadius: i === 0 ? 4 : 0,
              borderTopRightRadius: i === data.length - 1 ? 4 : 0,
              borderBottomRightRadius: i === data.length - 1 ? 4 : 0,
            }}
          />
        ))}
      </div>

      <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
        {data.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: s.color }}
            />
            <span className="text-xs text-ink-300">{s.label}</span>
            <span className="text-xs font-semibold tabular-nums text-ink-100">
              {s.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Barras ordenadas — comparação de magnitude entre categorias */
export function RankedBars({ slices }: { slices: Slice[] }) {
  const data = [...slices].filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
  if (data.length === 0) {
    return <p className="text-xs text-ink-600">Nenhum registrado.</p>;
  }
  const max = Math.max(...data.map((s) => s.value));

  return (
    <ul className="flex flex-col gap-2">
      {data.map((s) => (
        <li key={s.key} className="flex items-center gap-2.5">
          <span className="w-28 shrink-0 truncate text-xs text-ink-300">
            {s.label}
          </span>
          <span className="h-2.5 min-w-0 flex-1">
            <span
              className="block h-full rounded-r-[4px]"
              style={{
                width: `${Math.max((s.value / max) * 100, 3)}%`,
                background: s.color,
              }}
            />
          </span>
          <span className="w-6 shrink-0 text-right text-xs font-semibold tabular-nums text-ink-100">
            {s.value}
          </span>
        </li>
      ))}
    </ul>
  );
}

export interface DivergingRow {
  key: string;
  label: string;
  value: number;
  detail?: string;
}

/**
 * Saldo por jogador. Polaridade, então divergente a partir do zero:
 * o sinal vem do número e da direção da barra, nunca só da cor.
 */
export function DivergingBars({
  rows,
  goodColor,
  badColor,
}: {
  rows: DivergingRow[];
  goodColor: string;
  badColor: string;
}) {
  if (rows.length === 0) {
    return <p className="text-xs text-ink-600">Sem scout por atleta nesta partida.</p>;
  }
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => {
        const pct = (Math.abs(r.value) / max) * 50;
        const positive = r.value >= 0;
        return (
          <li key={r.key} className="flex items-center gap-2">
            <span className="w-20 shrink-0 truncate text-xs text-ink-200">
              {r.label}
            </span>
            <span className="relative h-2.5 min-w-0 flex-1">
              <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-ink-700" />
              <span
                className={cn(
                  'absolute top-0 h-full',
                  positive ? 'left-1/2 rounded-r-[4px]' : 'right-1/2 rounded-l-[4px]',
                )}
                style={{
                  width: `${pct}%`,
                  background: positive ? goodColor : badColor,
                }}
              />
            </span>
            <span
              className={cn(
                'w-9 shrink-0 text-right text-xs font-semibold tabular-nums',
                positive ? 'text-ink-100' : 'text-ink-300',
              )}
            >
              {positive ? '+' : '−'}
              {Math.abs(r.value)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
