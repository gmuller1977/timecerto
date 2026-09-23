import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, MessageCircle, Trash2, X } from 'lucide-react';
import type { Player, PlayerKind, SkillLevel } from '@/types';
import { Button } from '@/components/ui/Button';
import { StarRating } from '@/components/ui/StarRating';
import { useAppStore } from '@/store/useAppStore';
import { SPORTS } from '@/lib/sports';
import { ageOn } from '@/lib/pro';
import { formatPhone, isValidPhone, maskPhoneInput, onlyDigits, whatsappTo } from '@/lib/phone';
import { cn } from '@/lib/utils';

/**
 * Ficha do jogador amador, para o administrador: tudo o que o cadastro pelo
 * link preenche, editável, mais excluir. Telefone e nascimento só aparecem
 * aqui — nenhum link mostra.
 */
export function PlayerSheet({ player, onClose }: { player: Player; onClose: () => void }) {
  const navigate = useNavigate();
  const sport = useAppStore((s) => s.sport);
  const updatePlayer = useAppStore((s) => s.updatePlayer);
  const removePlayer = useAppStore((s) => s.removePlayer);

  const [name, setName] = useState(player.name);
  const [kind, setKind] = useState<PlayerKind>(player.kind ?? 'mensalista');
  const [birth, setBirth] = useState(player.birthDate ?? '');
  const [phone, setPhone] = useState(player.phone ? formatPhone(player.phone) : '');
  const [position, setPosition] = useState(player.positions[sport] ?? '');
  const [level, setLevel] = useState<SkillLevel>((player.skills[sport] ?? 3) as SkillLevel);
  const [error, setError] = useState<string | null>(null);

  const age = birth ? ageOn(birth) : null;
  const fone = onlyDigits(phone);

  function save() {
    if (name.trim().length < 2) return setError('Falta o nome.');
    if (fone && !isValidPhone(fone)) return setError('Telefone inválido — use DDD e número.');
    updatePlayer(player.id, {
      name: name.trim(),
      kind,
      birthDate: birth || undefined,
      phone: fone || undefined,
      skills: { ...player.skills, [sport]: level },
      positions: { ...player.positions, [sport]: position },
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="safe-bottom relative max-h-[92vh] overflow-y-auto rounded-t-3xl border-t border-ink-700 bg-ink-900 px-4 pt-4 pb-6">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink-700" />
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[17px] font-semibold text-ink-50">Jogador</p>
          <button onClick={onClose} className="p-1 text-ink-500" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        <label className="block text-xs font-medium text-ink-400">Nome</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          className="mt-1 w-full rounded-xl bg-ink-800 px-3 py-3 text-[15px] text-ink-50 outline-none"
        />

        <p className="mt-4 text-xs font-medium text-ink-400">Tipo</p>
        <div className="mt-1 flex gap-2">
          {(['mensalista', 'convidado'] as PlayerKind[]).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={cn(
                'flex-1 rounded-xl border py-2.5 text-sm font-semibold',
                kind === k
                  ? 'border-brand-500 bg-brand-500/15 text-brand-300'
                  : 'border-ink-800 bg-ink-950 text-ink-400',
              )}
            >
              {k === 'mensalista' ? 'Mensalista' : 'Convidado'}
            </button>
          ))}
        </div>

        <div className="mt-4 flex gap-3">
          <div className="min-w-0 flex-1">
            <label className="block text-xs font-medium text-ink-400">
              Nascimento{age !== null && <span className="text-ink-500"> · {age} anos</span>}
            </label>
            <input
              type="date"
              value={birth}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setBirth(e.target.value)}
              className="mt-1 w-full rounded-xl bg-ink-800 px-3 py-3 text-[15px] text-ink-50 outline-none [color-scheme:dark]"
            />
          </div>
          <div className="min-w-0 flex-1">
            <label className="block text-xs font-medium text-ink-400">Telefone</label>
            <input
              value={phone}
              onChange={(e) => setPhone(maskPhoneInput(e.target.value))}
              inputMode="tel"
              placeholder="(11) 98765-4321"
              className="mt-1 w-full rounded-xl bg-ink-800 px-3 py-3 text-[15px] text-ink-50 placeholder:text-ink-600 outline-none"
            />
          </div>
        </div>

        <p className="mt-4 text-xs font-medium text-ink-400">Posição</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {SPORTS[sport].positions.map((p) => (
            <button
              key={p.id}
              onClick={() => setPosition(position === p.id ? '' : p.id)}
              className={cn(
                'rounded-xl border px-3 py-2 text-sm font-medium',
                position === p.id
                  ? 'border-brand-500 bg-brand-500/15 text-brand-300'
                  : 'border-ink-800 bg-ink-950 text-ink-400',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        <p className="mt-4 text-xs font-medium text-ink-400">Nível (é o que o sorteio usa)</p>
        <div className="mt-2">
          <StarRating value={level} onChange={setLevel} size={26} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {isValidPhone(fone) && (
            <a
              href={whatsappTo(fone)}
              target="_blank"
              rel="noopener"
              className="flex items-center gap-1.5 rounded-lg border border-ink-800 px-3 py-2 text-xs font-medium text-ink-300"
            >
              <MessageCircle size={14} />
              Chamar no WhatsApp
            </a>
          )}
          <button
            onClick={() => navigate(`/jogador/${player.id}`)}
            className="flex items-center gap-1.5 rounded-lg border border-ink-800 px-3 py-2 text-xs font-medium text-ink-300"
          >
            <BarChart3 size={14} />
            Estatísticas
          </button>
        </div>

        {error && <p className="mt-4 text-sm text-red-300">{error}</p>}

        <div className="mt-5 flex gap-2">
          <Button
            variant="danger"
            size="lg"
            aria-label="Excluir jogador"
            onClick={() => {
              if (window.confirm(`Excluir ${player.name}? Ele sai da lista e dos links.`)) {
                removePlayer(player.id);
                onClose();
              }
            }}
          >
            <Trash2 size={18} />
          </Button>
          <Button size="lg" className="flex-1" onClick={save}>
            Salvar
          </Button>
        </div>
      </div>
    </div>
  );
}
