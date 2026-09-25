import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/store/useAppStore';
import { useJogoStore } from '@/store/useJogoStore';
import { hoje } from '@/lib/jogo';
import { SPORTS, SPORT_LIST } from '@/lib/sports';
import { cn } from '@/lib/utils';
import type { Jogo, SportId } from '@/types';

/**
 * Criar ou editar um jogo. Novo vem preenchido: o esporte em que o app está,
 * hoje, 20:00, local em branco e vagas = jogadores por time × times. Vagas em
 * branco = sem limite.
 *
 * O esporte é do JOGO (migração 014, pedido do Guilherme em 25/09/2026): um
 * grupo pode marcar futebol na terça e vôlei na quinta. Depois do sorteio ele
 * não muda — os times foram feitos com os níveis daquele esporte.
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
  const sportDoApp = useAppStore((s) => s.sport);
  const settings = useAppStore((s) => s.settings);
  const criarJogo = useJogoStore((s) => s.criarJogo);
  const editarJogo = useJogoStore((s) => s.editarJogo);
  const vagasPadrao = (sp: SportId) => String(SPORTS[sp].defaultTeamSize * settings.numberOfTeams);
  const [sport, setSport] = useState<SportId>(jogo?.sport ?? sportDoApp);
  const [date, setDate] = useState(() => jogo?.date ?? hoje());
  const [time, setTime] = useState(jogo?.time ?? '20:00');
  const [place, setPlace] = useState(jogo?.place ?? '');
  const [vagas, setVagas] = useState(() =>
    jogo ? (jogo.vagas == null ? '' : String(jogo.vagas)) : String(settings.teamSize * settings.numberOfTeams),
  );
  const [error, setError] = useState<string | null>(null);
  const travado = Boolean(jogo?.sorteio);

  // Num jogo novo, trocar o esporte refaz as vagas — se ninguém mexeu nelas
  function escolher(sp: SportId) {
    if (!jogo && (vagas === vagasPadrao(sport) || vagas === String(settings.teamSize * settings.numberOfTeams))) {
      setVagas(vagasPadrao(sp));
    }
    setSport(sp);
  }

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
      const patch = { sport, date, time, place: place.trim(), vagas: n };
      editarJogo(jogo.id, patch);
      onDone({ ...jogo, ...patch });
    } else {
      onDone(criarJogo({ sport, date, time, place: place.trim(), vagas: n }));
    }
  }

  const input =
    'w-full rounded-xl bg-ink-800 px-3 py-3 text-[15px] text-ink-50 placeholder:text-ink-500 outline-none';
  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div>
        <span className="text-xs font-medium text-ink-400">Modalidade</span>
        <div className="mt-1 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Modalidade">
          {SPORT_LIST.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={sport === s.id}
              aria-label={s.name}
              disabled={travado && sport !== s.id}
              onClick={() => escolher(s.id)}
              className={cn(
                'flex flex-col items-center gap-0.5 rounded-xl border py-2.5 transition-colors disabled:opacity-35',
                sport === s.id
                  ? 'border-brand-500 bg-brand-500/10 text-brand-300'
                  : 'border-ink-800 bg-ink-950 text-ink-400',
              )}
            >
              <span className="text-xl">{s.emoji}</span>
              <span className="text-xs font-medium">{s.name}</span>
            </button>
          ))}
        </div>
        {travado && (
          <p className="mt-1 text-[11px] text-ink-500">
            Os times já foram sorteados neste esporte; a modalidade não muda mais.
          </p>
        )}
      </div>
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
