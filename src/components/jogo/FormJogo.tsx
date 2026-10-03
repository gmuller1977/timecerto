import { useState } from 'react';
import { usePlano } from '@/store/usePlano';
import { promoverEmPadrao, usaPromocao } from '@/lib/promocao';
import { NOME_DA_COMPETICAO, type TipoDeJogo } from '@/types';
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
  // No time (fase 2): o esporte é o vôlei, e o jogo é amistoso ou campeonato
  const pro = (useAppStore((s) => s.mode) ?? 'amador') === 'profissional';
  const [competicao, setCompeticao] = useState<TipoDeJogo>(jogo?.competicao ?? 'amistoso');
  const settings = useAppStore((s) => s.settings);
  const criarJogo = useJogoStore((s) => s.criarJogo);
  const editarJogo = useJogoStore((s) => s.editarJogo);
  const vagasPadrao = (sp: SportId) => String(SPORTS[sp].defaultTeamSize * settings.numberOfTeams);
  const [sport, setSport] = useState<SportId>(jogo?.sport ?? (pro ? 'volei' : sportDoApp));
  const [date, setDate] = useState(() => jogo?.date ?? hoje());
  const [time, setTime] = useState(jogo?.time ?? '20:00');
  const [place, setPlace] = useState(jogo?.place ?? '');
  const [vagas, setVagas] = useState(() =>
    jogo
      ? jogo.vagas == null
        ? ''
        : String(jogo.vagas)
      : // No time quem vem é o elenco: sem limite de vagas por padrão
        pro
        ? ''
        : String(settings.teamSize * settings.numberOfTeams),
  );
  // Migração 019: amistoso e treino saem sem cobrança de diária
  const [cobraDiaria, setCobraDiaria] = useState(jogo ? jogo.cobraDiaria !== false : true);
  /*
   * Inscrição em duas fases (migração 028): o jogo nasce com o padrão do
   * grupo — tantos dias antes, a tal hora — e pode ajustar. Grupo que não
   * configurou não vê nada disto, e o jogo segue a regra de sempre.
   */
  const promoGrupo = usePlano((s) => s.grupo?.promocao);
  const comPromocao = !pro && (Boolean(jogo?.promoverEm) || usaPromocao(promoGrupo));
  const paraCampo = (iso: string) => {
    const d = new Date(iso);
    const p2 = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
  };
  const [promoverEm, setPromoverEm] = useState(() =>
    jogo?.promoverEm
      ? paraCampo(jogo.promoverEm)
      : usaPromocao(promoGrupo)
        ? paraCampo(promoverEmPadrao(jogo?.date ?? hoje(), promoGrupo))
        : '',
  );
  const [promoTocada, setPromoTocada] = useState(false);
  const [preferenciaPermanente, setPreferenciaPermanente] = useState(
    jogo?.preferenciaPermanente ?? promoGrupo?.preferenciaPermanente ?? false,
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

  // Os campos da promoção, quando o jogo usa (vazio = sem promoção)
  function promocaoDoForm() {
    if (!comPromocao) return {};
    return {
      promoverEm: promoverEm ? new Date(promoverEm).toISOString() : null,
      preferenciaPermanente,
    };
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
      const patch = {
        sport,
        date,
        time,
        place: place.trim(),
        vagas: n,
        cobraDiaria: pro ? false : cobraDiaria,
        ...(pro ? { competicao } : {}),
        ...promocaoDoForm(),
      };
      editarJogo(jogo.id, patch);
      onDone({ ...jogo, ...patch });
    } else {
      onDone(
        criarJogo({
          sport,
          date,
          time,
          place: place.trim(),
          vagas: n,
          cobraDiaria: pro ? false : cobraDiaria,
          ...(pro ? { competicao } : {}),
          ...promocaoDoForm(),
        }),
      );
    }
  }

  const input =
    'w-full rounded-xl bg-ink-800 px-3 py-3 text-[15px] text-ink-50 placeholder:text-ink-500 outline-none';
  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      {pro && (
        <div>
          <span className="text-xs font-medium text-ink-400">Que jogo é?</span>
          <div className="mt-1 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo do jogo">
            {(['amistoso', 'campeonato'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={competicao === t}
                onClick={() => setCompeticao(t)}
                className={cn(
                  'rounded-xl border py-3 text-sm font-semibold transition-colors',
                  competicao === t
                    ? t === 'campeonato'
                      ? 'border-amber-400 bg-amber-400/10 text-amber-200'
                      : 'border-brand-500 bg-brand-500/10 text-brand-300'
                    : 'border-ink-800 bg-ink-950 text-ink-400',
                )}
              >
                {NOME_DA_COMPETICAO[t]}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className={pro ? 'hidden' : undefined}>
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
            onChange={(e) => {
              setDate(e.target.value);
              // A promoção acompanha a data do jogo enquanto ninguém a mexeu à mão
              if (!promoTocada && !jogo?.promoverEm && usaPromocao(promoGrupo) && e.target.value) {
                setPromoverEm(paraCampo(promoverEmPadrao(e.target.value, promoGrupo)));
              }
            }}
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
      {comPromocao && (
        <div className="mt-1 rounded-xl bg-ink-800 px-3 py-3">
          <label className="block">
            <span className="block text-[15px] text-ink-50">Convidados entram em</span>
            <span className="block text-[11px] text-ink-500">
              Até lá, só mensalista tem vaga; convidado se inscreve e espera
            </span>
            <input
              type="datetime-local"
              value={promoverEm}
              onChange={(e) => {
                setPromoverEm(e.target.value);
                setPromoTocada(true);
              }}
              className="mt-2 w-full rounded-xl bg-ink-900 px-3 py-2.5 text-[15px] text-ink-50 outline-none [color-scheme:dark]"
            />
          </label>
          <label className="mt-3 flex items-center justify-between gap-3">
            <span>
              <span className="block text-[14px] text-ink-50">Mensalista mantém a preferência depois</span>
              <span className="block text-[11px] text-ink-500">
                Desligado: depois da promoção, ordem de chegada para todos
              </span>
            </span>
            <input
              type="checkbox"
              checked={preferenciaPermanente}
              onChange={(e) => setPreferenciaPermanente(e.target.checked)}
              className="size-5 shrink-0 accent-brand-500"
            />
          </label>
        </div>
      )}
      {!pro && (
        <label className="mt-1 flex items-center justify-between gap-3 rounded-xl bg-ink-800 px-3 py-3">
          <span>
            <span className="block text-[15px] text-ink-50">Cobrar diária dos convidados</span>
            <span className="block text-[11px] text-ink-500">Desligue para amistoso ou treino</span>
          </span>
          <input
            type="checkbox"
            checked={cobraDiaria}
            onChange={(e) => setCobraDiaria(e.target.checked)}
            className="size-5 shrink-0 accent-brand-500"
          />
        </label>
      )}
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
