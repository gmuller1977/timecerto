import { Star } from 'lucide-react';
import type { SkillLevel } from '@/types';
import { cn } from '@/lib/utils';

interface Props {
  value: SkillLevel;
  onChange?: (value: SkillLevel) => void;
  size?: number;
  readOnly?: boolean;
}

export function StarRating({ value, onChange, size = 18, readOnly }: Props) {
  return (
    <div className="flex items-center gap-0.5">
      {([1, 2, 3, 4, 5] as SkillLevel[]).map((n) => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          onClick={(e) => {
            e.stopPropagation();
            onChange?.(n);
          }}
          className={cn(
            'p-0.5 transition-transform',
            !readOnly && 'active:scale-90 cursor-pointer',
          )}
          aria-label={`Nível ${n}`}
        >
          <Star
            size={size}
            className={cn(
              n <= value ? 'fill-amber-400 text-amber-400' : 'text-ink-600',
            )}
          />
        </button>
      ))}
    </div>
  );
}
