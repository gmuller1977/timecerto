import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { guestAthlete, guestUpdateAthlete, type GuestAthlete } from '@/lib/cloud';
import { AGE_GROUP_LABEL, NAIPE_LABEL, ageOn } from '@/lib/pro';
import { getPositionLabel } from '@/lib/sports';
import type { AgeGroup, Naipe } from '@/types';
import { Frame } from '@/pages/GuestGroupPage';

function parseHeight(s: string): number | null | undefined {
  const t = s.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const cm = n < 3 ? Math.round(n * 100) : Math.round(n);
  return cm >= 80 && cm <= 250 ? cm : undefined;
}
function parseWeight(s: string): number | null | undefined {
  const t = s.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 20 && n <= 250 ? Math.round(n * 10) / 10 : undefined;
}

/**
 * Link pessoal do atleta. Ele completa nascimento, altura e peso — nome,
 * categoria e posição são do técnico e aparecem só para conferência.
 * Menor de idade precisa do aceite do responsável (LGPD, dado de criança e
 * adolescente).
 */
export function GuestAthletePage() {
  const { token = '' } = useParams();
  const [data, setData] = useState<GuestAthlete | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [birth, setBirth] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    guestAthlete(token)
      .then((d) => {
        setData(d);
        setBirth(d.athlete.birthDate ?? '');
        setHeight(d.athlete.heightCm ? (d.athlete.heightCm / 100).toFixed(2).replace('.', ',') : '');
        setWeight(d.athlete.weightKg ? String(d.athlete.weightKg).replace('.', ',') : '');
      })
      .catch((e) => {
        console.error('link do atleta', e);
        setError(
          navigator.onLine
            ? 'Este link não é mais válido. Peça um novo ao seu técnico.'
            : 'Sem internet. Conecte e tente de novo.',
        );
      });
  }, [token]);

  if (error) return <Frame><p className="mt-10 text-center text-sm leading-relaxed text-ink-400">{error}</p></Frame>;
  if (!data) return <Frame><p className="mt-10 text-center text-sm text-ink-500">Carregando…</p></Frame>;

  const a = data.athlete;
  const age = birth ? ageOn(birth) : null;
  const minor = age !== null && age < 18;

  async function save() {
    const h = parseHeight(height);
    if (h === undefined) return setFormError('Altura inválida — use 1,75 ou 175.');
    const w = parseWeight(weight);
    if (w === undefined) return setFormError('Peso inválido — use 62 ou 62,5.');
    if (minor && !consent) return setFormError('Falta a autorização do responsável.');
    setFormError(null);
    setSaving(true);
    try {
      await guestUpdateAthlete(token, birth || null, h, w);
      setSaved(true);
    } catch (e) {
      console.error('salvar atleta', e);
      setFormError('Não deu para salvar. Confira a internet e tente de novo.');
    }
    setSaving(false);
  }

  if (saved) {
    return (
      <Frame>
        <div className="mt-12 text-center">
          <CheckCircle2 size={48} className="mx-auto text-brand-400" />
          <p className="mt-4 text-xl font-bold text-ink-50">Cadastro salvo!</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-400">
            O técnico do {data.group.name} já recebe os seus dados.
            <br />
            Se precisar corrigir, é só abrir este mesmo link.
          </p>
          <button onClick={() => setSaved(false)} className="mt-6 text-sm text-brand-400 underline">
            Voltar ao cadastro
          </button>
        </div>
      </Frame>
    );
  }

  const fixed = [
    a.position && getPositionLabel('volei', a.position),
    a.ageGroup && AGE_GROUP_LABEL[a.ageGroup as AgeGroup],
    a.naipe && NAIPE_LABEL[a.naipe as Naipe],
  ].filter(Boolean);

  return (
    <Frame>
      <p className="text-sm text-ink-400">{data.group.name}</p>
      <h1 className="text-2xl font-bold tracking-tight">Olá, {a.name.split(' ')[0]}!</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-400">
        Complete seu cadastro. Leva um minuto, e só o seu técnico vê.
      </p>

      <div className="mt-5 rounded-2xl border border-ink-800 bg-ink-900 p-4">
        <p className="text-[15px] font-semibold text-ink-50">{a.name}</p>
        {fixed.length > 0 && <p className="mt-0.5 text-xs text-ink-400">{fixed.join(' · ')}</p>}
        <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
          Algo errado aqui? Avise o técnico — estes dados são dele.
        </p>
      </div>

      <label className="mt-5 block text-xs font-medium text-ink-400">Data de nascimento</label>
      <div className="mt-1 flex items-center gap-3">
        <input
          type="date"
          value={birth}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => setBirth(e.target.value)}
          className="min-w-0 flex-1 rounded-xl bg-ink-800 px-3 py-3 text-[16px] text-ink-50 outline-none [color-scheme:dark]"
        />
        {age !== null && <span className="shrink-0 text-sm text-ink-300">{age} anos</span>}
      </div>

      <div className="mt-4 flex gap-3">
        <div className="min-w-0 flex-1">
          <label className="block text-xs font-medium text-ink-400">Altura (m)</label>
          <input
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            inputMode="decimal"
            placeholder="1,75"
            className="mt-1 w-full rounded-xl bg-ink-800 px-3 py-3 text-[16px] text-ink-50 placeholder:text-ink-600 outline-none"
          />
        </div>
        <div className="min-w-0 flex-1">
          <label className="block text-xs font-medium text-ink-400">Peso (kg)</label>
          <input
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            inputMode="decimal"
            placeholder="62"
            className="mt-1 w-full rounded-xl bg-ink-800 px-3 py-3 text-[16px] text-ink-50 placeholder:text-ink-600 outline-none"
          />
        </div>
      </div>

      {minor && (
        <label className="mt-5 flex items-start gap-3 rounded-2xl border border-ink-700 bg-ink-900 p-4">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-brand-500"
          />
          <span className="text-sm leading-relaxed text-ink-300">
            Sou o responsável legal por {a.name.split(' ')[0]} e autorizo o uso destes
            dados pelo técnico do {data.group.name}, só para a organização do time.
          </span>
        </label>
      )}

      {formError && <p className="mt-4 text-sm text-red-300">{formError}</p>}

      <Button size="lg" className="mt-6 w-full" disabled={saving} onClick={save}>
        {saving ? 'Salvando…' : 'Salvar cadastro'}
      </Button>
    </Frame>
  );
}
