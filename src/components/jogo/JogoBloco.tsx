import { lazy, Suspense, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarPlus, ChevronRight, MapPin, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/store/useAppStore';
import { useJogoStore } from '@/store/useJogoStore';
import { hoje } from '@/lib/jogo';
import { hasSavedSession, isCloudAvailable } from '@/lib/sessao';
import type { Distribuicao } from '@/lib/vagas';
import type { Jogo } from '@/types';

// A parte dos links traz o Supabase: só para quem tem sessão salva
const JogoNuvem = lazy(() =>
  import('@/components/cloud/JogoNuvem').then((m) => ({ default: m.JogoNuvem })),
);

const fmtData = (jogo: Jogo) =>
  new Date(`${jogo.date}T${jogo.time}`).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
  });

/**
 * O bloco do jogo no topo da aba Jogo — um só, fundido: o Jogo do aparelho
 * (data, horário, local, vagas) e, para quem tem conta, os links do WhatsApp
 * dentro dele. Sem jogo aberto, "Criar jogo" já preenchido.
 */
export function JogoBloco({ jogo, dist }: { jogo: Jogo | null; dist: Distribuicao | null }) {
  const navigate = useNavigate();
  const [comSessao] = useState(hasSavedSession);
  const [formOpen, setFormOpen] = useState(false);

  const nuvem = comSessao ? (
    <Suspense fallback={null}>
      <JogoNuvem jogo={jogo} />
    </Suspense>
  ) : (
    isCloudAvailable && (
      <button
        onClick={() => navigate('/entrar?volta=/amador')}
        className="mt-3 flex w-full items-center gap-3 rounded-xl border border-ink-800 px-3 py-2.5 text-left"
      >
        <MessageCircle size={17} className="shrink-0 text-brand-400" />
        <span className="min-w-0 flex-1 text-sm text-ink-300">
          Confirmação pelo WhatsApp
          <span className="block text-xs text-ink-500">Entre para convidar o grupo</span>
        </span>
        <ChevronRight size={17} className="shrink-0 text-ink-600" />
      </button>
    )
  );

  if (!jogo) {
    return (
      <section className="mb-4 rounded-2xl border border-ink-800 bg-ink-900 p-4">
        <p className="text-xs font-semibold tracking-wide text-brand-400 uppercase">Jogo</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-400">
          Nenhum jogo aberto. Crie o jogo para marcar quem vem e sortear.
        </p>
        <CriarJogo onDone={() => setFormOpen(false)} />
        {nuvem}
      </section>
    );
  }

  const jogam = dist ? dist.mensalistasConfirmados + dist.convidadosComVaga : 0;
  return (
    <section className="mb-4 rounded-2xl border border-ink-800 bg-ink-900 p-4">
      <p className="text-xs font-semibold tracking-wide text-brand-400 uppercase">Jogo</p>
      <p className="mt-1 text-[17px] font-semibold capitalize text-ink-50">
        {fmtData(jogo)} · {jogo.time}
      </p>
      {jogo.place && (
        <p className="flex items-center gap-1 text-sm text-ink-300">
          <MapPin size={14} className="shrink-0 text-ink-500" />
          {jogo.place}
        </p>
      )}
      <p className="mt-2 text-sm text-ink-300">
        <strong className="text-ink-50">{jogam}</strong>{' '}
        {jogam === 1 ? 'confirmado' : 'confirmados'}
        {jogo.vagas != null
          ? ` · ${dist?.livres ?? jogo.vagas} ${dist?.livres === 1 ? 'vaga' : 'vagas'}`
          : ' · sem limite de vagas'}
        {dist && dist.naFila > 0 && ` · ${dist.naFila} na fila`}
      </p>

      {nuvem}

      <div className="mt-3 border-t border-ink-800 pt-3">
        {formOpen ? (
          <CriarJogo onDone={() => setFormOpen(false)} onCancel={() => setFormOpen(false)} trocando />
        ) : (
          <button
            onClick={() => setFormOpen(true)}
            className="flex items-center text-sm font-medium text-brand-400"
          >
            <CalendarPlus size={15} className="mr-1.5" />
            Abrir outro jogo
          </button>
        )}
      </div>
    </section>
  );
}

/**
 * Formulário do jogo, já preenchido: hoje, 20:00, local em branco, e vagas =
 * jogadores por time × times do sorteio. Horário e local padrão chegam com
 * Ajustes (etapa 4). Vagas em branco = sem limite.
 */
function CriarJogo({
  onDone,
  onCancel,
  trocando = false,
}: {
  onDone: () => void;
  onCancel?: () => void;
  trocando?: boolean;
}) {
  const sport = useAppStore((s) => s.sport);
  const settings = useAppStore((s) => s.settings);
  const criarJogo = useJogoStore((s) => s.criarJogo);
  const [date, setDate] = useState(() => hoje());
  const [time, setTime] = useState('20:00');
  const [place, setPlace] = useState('');
  const [vagas, setVagas] = useState(() => String(settings.teamSize * settings.numberOfTeams));
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
    criarJogo({ sport, date, time, place: place.trim(), vagas: n });
    onDone();
  }

  const input =
    'w-full rounded-xl bg-ink-800 px-3 py-3 text-[15px] text-ink-50 placeholder:text-ink-500 outline-none';
  return (
    <form onSubmit={submit} className="mt-3 flex flex-col gap-2">
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
          {trocando ? 'Trocar por este jogo' : 'Criar jogo'}
        </Button>
      </div>
      <p className="text-[11px] leading-relaxed text-ink-500">
        Mensalista que confirma sempre joga. Convidado entra numa fila e joga se sobrar
        vaga, por ordem de chegada.
        {trocando && ' Abrir outro jogo encerra este.'}
      </p>
    </form>
  );
}
