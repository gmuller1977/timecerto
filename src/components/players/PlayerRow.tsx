import { Check, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Player, SkillLevel } from '@/types';
import { StarRating } from '@/components/ui/StarRating';
import { useAppStore } from '@/store/useAppStore';
import { cn, initials } from '@/lib/utils';
import { SPORTS, getPositionLabel } from '@/lib/sports';

export function PlayerRow({ player }: { player: Player }) {
  const navigate = useNavigate();
  const sport = useAppStore((s) => s.sport);
  const togglePresence = useAppStore((s) => s.togglePresence);
  const setSkill = useAppStore((s) => s.setSkill);
  const setPosition = useAppStore((s) => s.setPosition);
  const removePlayer = useAppStore((s) => s.removePlayer);

  const skill = (player.skills[sport] ?? 3) as SkillLevel;
  const position = player.positions[sport] ?? '';
  const positions = SPORTS[sport].positions;

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition-colors',
        player.present
          ? 'border-ink-800 bg-ink-900'
          : 'border-ink-900 bg-ink-950 opacity-50',
      )}
    >
      <button
        onClick={() => togglePresence(player.id)}
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors',
          player.present
            ? 'bg-brand-500 text-ink-950'
            : 'bg-ink-800 text-ink-500',
        )}
        aria-label={player.present ? 'Marcar ausente' : 'Marcar presente'}
      >
        {player.present ? <Check size={18} strokeWidth={3} /> : initials(player.name)}
      </button>

      <div className="min-w-0 flex-1">
        <button
          onClick={() => navigate(`/jogador/${player.id}`)}
          className="block max-w-full truncate text-left text-[15px] font-medium text-ink-50"
        >
          {player.name}
        </button>
        <div className="mt-1 flex items-center gap-2">
          <StarRating value={skill} onChange={(v) => setSkill(player.id, v)} size={15} />
          <select
            value={position}
            onChange={(e) => setPosition(player.id, e.target.value)}
            className="rounded-md bg-ink-800 px-1.5 py-0.5 text-[11px] font-medium text-ink-300 outline-none"
          >
            <option value="">Posição</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          {position && (
            <span className="text-[11px] text-ink-500">
              {getPositionLabel(sport, position)}
            </span>
          )}
        </div>
      </div>

      <button
        onClick={() => removePlayer(player.id)}
        className="shrink-0 p-2 text-ink-600 transition-colors hover:text-red-400"
        aria-label="Remover jogador"
      >
        <Trash2 size={17} />
      </button>
    </div>
  );
}
