import { SPORT_LIST } from '@/lib/sports';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';

export function SportPicker() {
  const sport = useAppStore((s) => s.sport);
  const setSport = useAppStore((s) => s.setSport);

  return (
    <div className="grid grid-cols-3 gap-2">
      {SPORT_LIST.map((s) => (
        <button
          key={s.id}
          onClick={() => setSport(s.id)}
          className={cn(
            'flex flex-col items-center gap-1 rounded-2xl border py-3 transition-all active:scale-[0.97]',
            sport === s.id
              ? 'border-brand-500 bg-brand-500/10 text-brand-300'
              : 'border-ink-800 bg-ink-900 text-ink-400',
          )}
        >
          <span className="text-2xl">{s.emoji}</span>
          <span className="text-xs font-medium">{s.name}</span>
        </button>
      ))}
    </div>
  );
}
