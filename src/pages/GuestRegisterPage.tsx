import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { StarRating } from '@/components/ui/StarRating';
import { guestRegister, guestRegisterAtleta, guestRegisterInfo, type InfoDoCadastro } from '@/lib/cloud';
import { AGE_GROUP_LABEL, NAIPE_LABEL, ageOn } from '@/lib/pro';
import { SPORTS } from '@/lib/sports';
import { isValidPhone, maskPhoneInput, onlyDigits } from '@/lib/phone';
import type { SkillLevel, SportId } from '@/types';
import { cn } from '@/lib/utils';
import { Frame } from '@/pages/GuestGroupPage';

/**
 * Link de cadastro. Sem conta: a pessoa preenche e o pedido fica pendente até
 * o administrador aprovar.
 *
 * Na pelada é o mensalista, com nível (sugestão — quem decide o que o sorteio
 * usa é o administrador). No time (migração 027) é o atleta: sem nível e sem
 * apelido, com altura, peso e as posições em ordem; categoria e naipe são os
 * do time, e só aparecem para ele saber onde está entrando.
 */
export function GuestRegisterPage() {
  const { code = '' } = useParams();
  const [info, setInfo] = useState<InfoDoCadastro | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [birth, setBirth] = useState('');
  const [phone, setPhone] = useState('');
  const [position, setPosition] = useState('');
  const [level, setLevel] = useState<SkillLevel>(3);
  // Só no time
  const [posicoes, setPosicoes] = useState<string[]>([]);
  const [altura, setAltura] = useState('');
  const [peso, setPeso] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    guestRegisterInfo(code)
      .then(setInfo)
      .catch((e) => {
        console.error('link de cadastro', e);
        setError(
          navigator.onLine
            ? 'Este link de cadastro não é mais válido. Peça outro ao organizador.'
            : 'Sem internet. Conecte e tente de novo.',
        );
      });
  }, [code]);

  if (error) return <Frame><p className="mt-10 text-center text-sm leading-relaxed text-ink-400">{error}</p></Frame>;
  if (!info) return <Frame><p className="mt-10 text-center text-sm text-ink-500">Carregando…</p></Frame>;

  if (done) {
    return (
      <Frame>
        <div className="mt-12 text-center">
          <CheckCircle2 size={48} className="mx-auto text-brand-400" />
          <p className="mt-4 text-xl font-bold text-ink-50">Cadastro enviado!</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-400">
            {info.mode === 'profissional' ? 'O técnico' : 'O organizador'} do {info.name} vai aprovar.
            <br />
            {info.mode === 'profissional'
              ? 'Depois disso você aparece no elenco.'
              : 'Depois disso você confirma presença pelo link dos jogos.'}
          </p>
        </div>
      </Frame>
    );
  }

  const sport = (info.sport in SPORTS ? info.sport : 'futebol') as SportId;
  const age = birth ? ageOn(birth) : null;
  const pro = info.mode === 'profissional';
  const numero = (s: string) => {
    const n = Number(s.replace(',', '.'));
    return s.trim() && Number.isFinite(n) ? n : undefined;
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const fone = onlyDigits(phone);
    if (name.trim().length < 2) return setFormError('Falta o nome.');
    if (!birth) return setFormError('Falta a data de nascimento.');
    if (!isValidPhone(fone)) return setFormError('Telefone inválido — use DDD e número.');
    setFormError(null);
    setSaving(true);
    try {
      if (pro) {
        const m = numero(altura);
        // "1,72" é metro; "172" já é centímetro
        const heightCm = m === undefined ? undefined : m < 3 ? Math.round(m * 100) : Math.round(m);
        await guestRegisterAtleta(code, { name, birthDate: birth, phone: fone, posicoes, heightCm, weightKg: numero(peso) });
      } else {
        await guestRegister(code, { name, nickname, birthDate: birth, phone: fone, position, level });
      }
      setDone(true);
    } catch (err) {
      console.error('cadastro pelo link', err);
      const msg = (err as { message?: string })?.message;
      setFormError(
        msg && !/fetch|network/i.test(msg) ? msg : 'Não deu para enviar. Confira a internet.',
      );
    }
    setSaving(false);
  }

  return (
    <Frame>
      <p className="text-xs font-semibold tracking-wide text-brand-400 uppercase">
        {pro ? 'Cadastro de atleta' : 'Cadastro de mensalista'}
      </p>
      <h1 className="text-2xl font-bold tracking-tight">{info.name}</h1>
      {pro && info.ageGroup && info.naipe && (
        <p className="mt-1 text-sm text-ink-300">
          {AGE_GROUP_LABEL[info.ageGroup]} · {NAIPE_LABEL[info.naipe]}
        </p>
      )}
      <p className="mt-2 text-sm leading-relaxed text-ink-400">
        Preencha uma vez. Telefone e nascimento ficam só com {pro ? 'o técnico' : 'o organizador'}.
      </p>

      <form onSubmit={submit} className="mt-5">
        <label className="block text-xs font-medium text-ink-400">Nome</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          autoComplete="name"
          placeholder="Nome e sobrenome"
          className="mt-1 w-full rounded-xl bg-ink-800 px-3 py-3 text-[16px] text-ink-50 placeholder:text-ink-500 outline-none"
        />

        {!pro && (
          <>
            <label className="mt-4 block text-xs font-medium text-ink-400">
              Apelido <span className="font-normal text-ink-500">— opcional, é como aparece na lista</span>
            </label>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={20}
              placeholder="Ex.: Cadu"
              className="mt-1 w-full rounded-xl bg-ink-800 px-3 py-3 text-[16px] text-ink-50 placeholder:text-ink-500 outline-none"
            />
          </>
        )}

        <div className="mt-4 flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <label className="block text-xs font-medium text-ink-400">Data de nascimento</label>
            <input
              type="date"
              value={birth}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setBirth(e.target.value)}
              className="mt-1 w-full rounded-xl bg-ink-800 px-3 py-3 text-[16px] text-ink-50 outline-none [color-scheme:dark]"
            />
          </div>
          {age !== null && <p className="shrink-0 pb-3 text-sm text-ink-300">{age} anos</p>}
        </div>

        <label className="mt-4 block text-xs font-medium text-ink-400">Telefone (WhatsApp)</label>
        <input
          value={phone}
          onChange={(e) => setPhone(maskPhoneInput(e.target.value))}
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="(11) 98765-4321"
          className="mt-1 w-full rounded-xl bg-ink-800 px-3 py-3 text-[16px] text-ink-50 placeholder:text-ink-500 outline-none"
        />

        {pro && (
          <div className="mt-4 flex gap-3">
            <label className="min-w-0 flex-1">
              <span className="block text-xs font-medium text-ink-400">Altura (m)</span>
              <input
                value={altura}
                onChange={(e) => setAltura(e.target.value)}
                inputMode="decimal"
                placeholder="1,72"
                className="mt-1 w-full rounded-xl bg-ink-800 px-3 py-3 text-[16px] text-ink-50 placeholder:text-ink-500 outline-none"
              />
            </label>
            <label className="min-w-0 flex-1">
              <span className="block text-xs font-medium text-ink-400">Peso (kg)</span>
              <input
                value={peso}
                onChange={(e) => setPeso(e.target.value)}
                inputMode="decimal"
                placeholder="62"
                className="mt-1 w-full rounded-xl bg-ink-800 px-3 py-3 text-[16px] text-ink-50 placeholder:text-ink-500 outline-none"
              />
            </label>
          </div>
        )}

        {pro ? (
          <>
            <p className="mt-4 text-xs font-medium text-ink-400">
              Posições <span className="font-normal text-ink-500">— toque na ordem: a primeira é a principal</span>
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              {SPORTS.volei.positions.map((p) => {
                const ordem = posicoes.indexOf(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() =>
                      setPosicoes((a) => (a.includes(p.id) ? a.filter((x) => x !== p.id) : [...a, p.id]))
                    }
                    className={cn(
                      'flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium',
                      ordem >= 0 ? 'border-brand-500 bg-brand-500/15 text-brand-300' : 'border-ink-800 bg-ink-950 text-ink-400',
                    )}
                  >
                    {ordem >= 0 && (
                      <span
                        className={cn(
                          'flex size-4 items-center justify-center rounded-full text-[10px] font-bold',
                          ordem === 0 ? 'bg-brand-500 text-ink-950' : 'bg-ink-700 text-ink-200',
                        )}
                      >
                        {ordem + 1}
                      </span>
                    )}
                    {p.label}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
        <p className="mt-4 text-xs font-medium text-ink-400">Posição</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {SPORTS[sport].positions.map((p) => (
            <button
              key={p.id}
              type="button"
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

        <p className="mt-4 text-xs font-medium text-ink-400">Seu nível</p>
        <div className="mt-2 flex items-center gap-3">
          <StarRating value={level} onChange={setLevel} size={28} />
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-500">
          Seja sincero: é o que equilibra os times. O organizador pode ajustar.
        </p>
          </>
        )}

        {formError && <p className="mt-4 text-sm text-red-300">{formError}</p>}

        <Button type="submit" size="lg" className="mt-6 w-full" disabled={saving}>
          {saving ? 'Enviando…' : 'Enviar cadastro'}
        </Button>
      </form>
    </Frame>
  );
}
