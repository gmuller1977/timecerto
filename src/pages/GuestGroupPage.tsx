import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check, X } from 'lucide-react';
import { guestGroup, guestSetAttendance, type GuestGroup } from '@/lib/cloud';
import { getPositionLabel } from '@/lib/sports';
import type { SportId } from '@/types';
import { cn } from '@/lib/utils';

/** Quem este aparelho é, por grupo. Conveniência — errar custa um toque. */
const meKey = (code: string) => `timecerto:guest:${code.toUpperCase()}`;
function readMe(code: string): string | null {
  try {
    return localStorage.getItem(meKey(code));
  } catch {
    return null;
  }
}
function writeMe(code: string, id: string | null) {
  try {
    if (id) localStorage.setItem(meKey(code), id);
    else localStorage.removeItem(meKey(code));
  } catch {
    /* navegação privada: só não lembra */
  }
}

/**
 * O link do grupo no WhatsApp. Sem conta: a pessoa escolhe o próprio nome
 * uma vez e depois é só "vou" ou "não vou".
 */
export function GuestGroupPage() {
  const { code = '' } = useParams();
  const [data, setData] = useState<GuestGroup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<string | null>(() => readMe(code));
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await guestGroup(code));
      setError(null);
    } catch (e) {
      console.error('convite do grupo', e);
      setError(
        navigator.onLine
          ? 'Este convite não existe mais ou o link está incompleto. Peça outro ao organizador.'
          : 'Sem internet. Conecte e tente de novo.',
      );
    }
  }, [code]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <Frame><p className="mt-10 text-center text-sm leading-relaxed text-ink-400">{error}</p></Frame>;
  if (!data) return <Frame><p className="mt-10 text-center text-sm text-ink-500">Carregando…</p></Frame>;

  const mine = data.players.find((p) => p.id === me);
  const vao = data.players.filter((p) => p.status === 'vou');

  async function answer(status: 'vou' | 'nao_vou') {
    if (!data?.event || !mine) return;
    setSaving(true);
    try {
      await guestSetAttendance(code, data.event.id, mine.id, status);
      await load();
    } catch (e) {
      console.error('resposta de presença', e);
      setError('Não deu para salvar. Confira a internet e tente de novo.');
    }
    setSaving(false);
  }

  return (
    <Frame>
      <h1 className="text-2xl font-bold tracking-tight">{data.group.name}</h1>

      {!data.event ? (
        <p className="mt-6 rounded-2xl border border-ink-800 bg-ink-900 p-4 text-sm leading-relaxed text-ink-400">
          Nenhum jogo marcado agora. Quando o organizador marcar, é neste mesmo
          link que você confirma.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm capitalize text-ink-300">
            {data.event.title ? `${data.event.title} · ` : ''}
            {new Date(data.event.startsAt).toLocaleString('pt-BR', {
              weekday: 'long',
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>

          {mine ? (
            <section className="mt-6 rounded-2xl border border-ink-800 bg-ink-900 p-4">
              <p className="text-sm text-ink-400">
                Você é <span className="font-semibold text-ink-50">{mine.name}</span>
                <button
                  onClick={() => {
                    writeMe(code, null);
                    setMe(null);
                  }}
                  className="ml-2 text-xs text-ink-500 underline"
                >
                  não sou eu
                </button>
              </p>
              <p className="mt-3 text-[15px] font-semibold text-ink-50">Você vai?</p>
              <div className="mt-2 flex gap-2">
                <button
                  disabled={saving}
                  onClick={() => answer('vou')}
                  className={cn(
                    'flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl border text-base font-semibold active:scale-[0.98]',
                    mine.status === 'vou'
                      ? 'border-brand-500 bg-brand-500 text-ink-950'
                      : 'border-ink-700 bg-ink-800 text-ink-100',
                  )}
                >
                  <Check size={20} /> Vou
                </button>
                <button
                  disabled={saving}
                  onClick={() => answer('nao_vou')}
                  className={cn(
                    'flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl border text-base font-semibold active:scale-[0.98]',
                    mine.status === 'nao_vou'
                      ? 'border-ink-400 bg-ink-600 text-ink-50'
                      : 'border-ink-700 bg-ink-800 text-ink-100',
                  )}
                >
                  <X size={20} /> Não vou
                </button>
              </div>
              {mine.status && (
                <p className="mt-2 text-xs text-ink-500">
                  Resposta salva. Dá para mudar até o organizador fechar a lista.
                </p>
              )}
            </section>
          ) : (
            <section className="mt-6">
              <p className="text-[15px] font-semibold text-ink-50">Quem é você?</p>
              <p className="mt-1 text-xs text-ink-500">
                Toque no seu nome. Este celular lembra da próxima vez.
              </p>
            </section>
          )}
        </>
      )}

      <section className="mt-6">
        <p className="mb-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">
          {data.event ? `${vao.length} confirmados` : 'Jogadores'}
        </p>
        <div className="flex flex-col gap-1.5">
          {data.players.map((p) => (
            <button
              key={p.id}
              disabled={Boolean(mine)}
              onClick={() => {
                writeMe(code, p.id);
                setMe(p.id);
              }}
              className={cn(
                'flex items-center gap-3 rounded-xl border px-3 py-3 text-left',
                p.id === me ? 'border-brand-500/60 bg-brand-500/10' : 'border-ink-800 bg-ink-900',
                !mine && 'active:scale-[0.99]',
              )}
            >
              <span className="min-w-0 flex-1 truncate text-[15px] text-ink-50">{p.name}</span>
              {p.position && (
                <span className="shrink-0 text-xs text-ink-500">
                  {getPositionLabel(data.group.sport as SportId, p.position)}
                </span>
              )}
              <span className="w-5 shrink-0">
                {p.status === 'vou' && <Check size={17} className="text-brand-400" />}
                {p.status === 'nao_vou' && <X size={17} className="text-ink-500" />}
              </span>
            </button>
          ))}
        </div>
        {data.players.length === 0 && (
          <p className="text-sm text-ink-500">O organizador ainda não cadastrou ninguém.</p>
        )}
      </section>
    </Frame>
  );
}

export function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-12">
      <p className="safe-top pt-6 pb-4 text-sm font-bold tracking-tight text-ink-400">
        Time<span className="text-brand-400">Certo</span>
      </p>
      {children}
    </div>
  );
}
