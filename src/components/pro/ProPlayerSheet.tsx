import { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import type { AgeGroup, Naipe, ProPlayer } from '@/types';
import { AGE_GROUPS, NAIPES, ageOn, suggestAgeGroup } from '@/lib/pro';
import { SPORTS } from '@/lib/sports';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

type Draft = Omit<ProPlayer, 'id' | 'createdAt'>;

interface Props {
  /** Ausente = atleta novo */
  player?: ProPlayer;
  /** Categoria e naipe do filtro atual, para o atleta novo já nascer nele */
  defaults: { ageGroup: AgeGroup | null; naipe: Naipe | null };
  onSave: (draft: Draft) => void;
  onDelete?: () => void;
  onClose: () => void;
}

/** Aceita "1,85", "1.85" ou "185" — quem digita altura pensa nos dois */
function parseHeight(s: string): number | undefined | null {
  const t = s.trim().replace(',', '.');
  if (!t) return undefined;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  const cm = n < 3 ? Math.round(n * 100) : Math.round(n);
  return cm >= 80 && cm <= 250 ? cm : null;
}

function parseWeight(s: string): number | undefined | null {
  const t = s.trim().replace(',', '.');
  if (!t) return undefined;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 20 || n > 250) return null;
  return Math.round(n * 10) / 10;
}

const pill = (active: boolean) =>
  cn(
    'shrink-0 rounded-xl border px-3 py-2 text-sm font-medium',
    active
      ? 'border-brand-500 bg-brand-500/15 text-brand-300'
      : 'border-ink-800 bg-ink-950 text-ink-400',
  );

export function ProPlayerSheet({ player, defaults, onSave, onDelete, onClose }: Props) {
  const [name, setName] = useState(player?.name ?? '');
  const [birthDate, setBirthDate] = useState(player?.birthDate ?? '');
  const [ageGroup, setAgeGroup] = useState<AgeGroup>(
    player?.ageGroup ?? defaults.ageGroup ?? 'adulto',
  );
  // Enquanto ninguém escolheu a categoria à mão, ela segue a data de nascimento
  const [groupTouched, setGroupTouched] = useState(
    Boolean(player) || defaults.ageGroup !== null,
  );
  const [naipe, setNaipe] = useState<Naipe>(player?.naipe ?? defaults.naipe ?? 'feminino');
  const [height, setHeight] = useState(
    player?.heightCm ? (player.heightCm / 100).toFixed(2).replace('.', ',') : '',
  );
  const [weight, setWeight] = useState(
    player?.weightKg ? String(player.weightKg).replace('.', ',') : '',
  );
  const [position, setPosition] = useState(player?.position ?? '');
  const [error, setError] = useState<string | null>(null);

  const age = birthDate ? ageOn(birthDate) : null;
  const suggested = birthDate ? suggestAgeGroup(birthDate) : null;

  function changeBirth(v: string) {
    setBirthDate(v);
    const s = v ? suggestAgeGroup(v) : null;
    if (s && !groupTouched) setAgeGroup(s);
  }

  function save() {
    if (!name.trim()) return setError('Falta o nome.');
    const heightCm = parseHeight(height);
    if (heightCm === null) return setError('Altura inválida — use 1,85 ou 185.');
    const weightKg = parseWeight(weight);
    if (weightKg === null) return setError('Peso inválido — use 78 ou 78,5.');
    onSave({
      name: name.trim(),
      birthDate: birthDate || undefined,
      ageGroup,
      naipe,
      heightCm,
      weightKg,
      position: position || undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="safe-bottom relative max-h-[92vh] overflow-y-auto rounded-t-3xl border-t border-ink-700 bg-ink-900 px-4 pt-4 pb-6">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink-700" />
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[17px] font-semibold text-ink-50">
            {player ? 'Editar atleta' : 'Novo atleta'}
          </p>
          <button onClick={onClose} className="p-1 text-ink-500" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        <label className="block text-xs font-medium text-ink-400">Nome</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus={!player}
          placeholder="Nome do atleta"
          className="mt-1 w-full rounded-xl bg-ink-800 px-3 py-3 text-[15px] text-ink-50 placeholder:text-ink-500 outline-none"
        />

        <div className="mt-4 flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <label className="block text-xs font-medium text-ink-400">
              Data de nascimento
            </label>
            <input
              type="date"
              value={birthDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => changeBirth(e.target.value)}
              className="mt-1 w-full rounded-xl bg-ink-800 px-3 py-3 text-[15px] text-ink-50 outline-none [color-scheme:dark]"
            />
          </div>
          <p className="shrink-0 pb-3 text-sm text-ink-300">
            {age !== null ? `${age} anos` : ''}
          </p>
        </div>

        <p className="mt-4 text-xs font-medium text-ink-400">
          Categoria
          {suggested && suggested !== ageGroup && (
            <span className="font-normal text-ink-500">
              {' '}— pelo ano de nascimento seria{' '}
              {AGE_GROUPS.find((g) => g.id === suggested)?.label}
            </span>
          )}
        </p>
        <div className="no-scrollbar mt-1 flex gap-2 overflow-x-auto pb-1">
          {AGE_GROUPS.map((g) => (
            <button
              key={g.id}
              onClick={() => {
                setAgeGroup(g.id);
                setGroupTouched(true);
              }}
              className={pill(ageGroup === g.id)}
            >
              {g.label}
            </button>
          ))}
        </div>

        <p className="mt-4 text-xs font-medium text-ink-400">Naipe</p>
        <div className="mt-1 flex gap-2">
          {NAIPES.map((n) => (
            <button
              key={n.id}
              onClick={() => setNaipe(n.id)}
              className={cn(pill(naipe === n.id), 'flex-1')}
            >
              {n.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex gap-3">
          <div className="min-w-0 flex-1">
            <label className="block text-xs font-medium text-ink-400">Altura (m)</label>
            <input
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              inputMode="decimal"
              placeholder="1,85"
              className="mt-1 w-full rounded-xl bg-ink-800 px-3 py-3 text-[15px] text-ink-50 placeholder:text-ink-600 outline-none"
            />
          </div>
          <div className="min-w-0 flex-1">
            <label className="block text-xs font-medium text-ink-400">Peso (kg)</label>
            <input
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              inputMode="decimal"
              placeholder="78"
              className="mt-1 w-full rounded-xl bg-ink-800 px-3 py-3 text-[15px] text-ink-50 placeholder:text-ink-600 outline-none"
            />
          </div>
        </div>

        <p className="mt-4 text-xs font-medium text-ink-400">Posição</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {SPORTS.volei.positions.map((p) => (
            <button
              key={p.id}
              onClick={() => setPosition(position === p.id ? '' : p.id)}
              className={pill(position === p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {error && <p className="mt-4 text-sm text-red-300">{error}</p>}

        <div className="mt-5 flex gap-2">
          {onDelete && (
            <Button
              variant="danger"
              size="lg"
              aria-label="Excluir atleta"
              onClick={() => {
                if (window.confirm(`Excluir ${player?.name}?`)) onDelete();
              }}
            >
              <Trash2 size={18} />
            </Button>
          )}
          <Button size="lg" className="flex-1" onClick={save}>
            {player ? 'Salvar' : 'Cadastrar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
