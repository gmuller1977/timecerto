import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/store/useAppStore';
import { useJogoStore } from '@/store/useJogoStore';
import { hoje } from '@/lib/jogo';
import type { Jogo } from '@/types';

/**
 * Criar ou editar um jogo. Novo vem preenchido: hoje, 20:00, local em branco e
 * vagas = jogadores por time × times do sorteio. Horário e local padrão chegam
 * com Ajustes (etapa 4). Vagas em branco = sem limite.
 */
export function FormJogo({
  jogo,
  onDone,
  onCancel,
}: {
  /** Presente = editar este jogo */
  jogo?: Jogo;
  onDone: (jogo: Jogo) => void;
  onCancel?: () => void;
}) {
  const sport = useAppStore((s) => s.sport);
  const settings = useAppStore((s) => s.settings);
  const criarJogo = useJogoStore((s) => s.criarJogo);
  const editarJogo = useJogoStore((s) => s.editarJogo);
  const [date, setDate] = useState(() => jogo?.date ?? hoje());
  const [time, setTime] = useState(jogo?.time ?? '20:00');
  const [place, setPlace] = useState(jogo?.place ?? '');
  const [vagas, setVagas] = useState(() =>
    jogo ? (jogo.vagas == null ? '' : String(jogo.vagas)) : String(settings.teamSize * settings.numberOfTeams),
  );
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = vagas.trim() ? Number(vagas) : null;
    if (n !== null && (!Number.isInteger(n) || n < 2 || n > 200)) {
      setError('Vagas: use um número entre 2 e 200, ou deixe em branco para não ter limite.');
      return;
    }
    if (!date || !time) {
      setError('Falta a data ou o horário.');
      return;
    }
    if (jogo) {
      editarJogo(jogo.id, { date, time, place: place.trim(), vagas: n });
      onDone({ ...jogo, date, time, place: place.trim(), vagas: n });
    } else {
      onDone(criarJogo({ sport, date, time, place: place.trim(), vagas: n }));
    }
  }

  const input =
    'w-full rounded-xl bg-ink-800 px-3 py-3 text-[15px] text-ink-50 placeholder:text-ink-500 outline-none';
  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <label className="min-w-0 flex-[3]">
          <span className="text-xs font-medium text-ink-400">Data</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={`${input} mt-1 [color-scheme:dark]`}
          />
        </label>
        <label className="min-w-0 flex-[2]">
          <span className="text-xs font-medium text-ink-400">Horário</span>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className={`${input} mt-1 [color-scheme:dark]`}
          />
        </label>
      </div>
      <label>
        <span className="text-xs font-medium text-ink-400">Local</span>
        <input
          value={place}
          onChange={(e) => setPlace(e.target.value)}
          maxLength={120}
          placeholder="Ex.: Quadra do Clube"
          className={`${input} mt-1`}
        />
      </label>
      <label>
        <span className="text-xs font-medium text-ink-400">Vagas</span>
        <input
          value={vagas}
          onChange={(e) => setVagas(e.target.value.replace(/\D/g, ''))}
          inputMode="numeric"
          placeholder="Em branco, sem limite"
          className={`${input} mt-1`}
        />
      </label>
      {error && <p className="text-sm text-red-300">{error}</p>}
      <div className="mt-1 flex gap-2">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" className="flex-1">
          {jogo ? 'Salvar' : 'Criar jogo'}
        </Button>
      </div>
      {!jogo && (
        <p className="text-[11px] leading-relaxed text-ink-500">
          Mensalista que confirma sempre joga. Convidado entra numa fila e joga se sobrar
          vaga, por ordem de chegada. Os links do WhatsApp mostram sempre o próximo jogo.
        </p>
      )}
    </form>
  );
}
