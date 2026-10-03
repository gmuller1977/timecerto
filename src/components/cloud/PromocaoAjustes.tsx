import { useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/store/useAuth';
import { usePlano } from '@/store/usePlano';
import { findActiveGroup, salvarPromocaoDoGrupo, type CloudGroup } from '@/lib/cloud';
import { explain } from '@/components/cloud/partes';
import type { PromocaoDoGrupo } from '@/lib/promocao';
import { cn } from '@/lib/utils';

const DIAS_OPCOES = [1, 2, 3, 4, 5, 6, 7];

/**
 * Ajustes › Inscrição em duas fases (docs/telas-amador.md, migração 028).
 * Desligada, o grupo segue a regra de sempre — é como todo grupo nasce, e
 * ninguém é migrado à força. Ligada, vira o padrão de todo jogo NOVO: até a
 * promoção, só mensalista tem vaga; nela, os convidados da espera sobem por
 * ordem de inscrição. Cada jogo pode ajustar a data na hora de criar.
 */
export function PromocaoAjustes() {
  const ready = useAuth((s) => s.ready);
  const session = useAuth((s) => s.session);
  const [group, setGroup] = useState<CloudGroup | null>(null);
  const [f, setF] = useState<PromocaoDoGrupo>({ dias: null, hora: null, preferenciaPermanente: false });
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    if (!ready || !session) return;
    let vivo = true;
    findActiveGroup()
      .then((g) => {
        if (!vivo || !g) return;
        setGroup(g);
        setF(g.promocao);
      })
      .catch(() => {
        /* sem rede: o cartão não aparece */
      });
    return () => {
      vivo = false;
    };
  }, [ready, session]);

  if (!group) return null;
  const ligada = f.dias != null;
  const mudou =
    f.dias !== group.promocao.dias ||
    (ligada && (f.hora ?? '20:00') !== (group.promocao.hora ?? '20:00')) ||
    f.preferenciaPermanente !== group.promocao.preferenciaPermanente;

  async function salvar() {
    if (!group) return;
    setBusy(true);
    setErro(null);
    try {
      const novo = { ...f, hora: f.dias == null ? null : (f.hora ?? '20:00') };
      await salvarPromocaoDoGrupo(group.id, novo);
      const atualizado = { ...group, promocao: novo };
      setGroup(atualizado);
      // O formulário de jogo lê daqui: vale já no próximo jogo criado
      const plano = usePlano.getState();
      if (plano.grupo?.id === group.id) usePlano.setState({ grupo: { ...plano.grupo, promocao: novo } });
      setSalvo(true);
    } catch (e) {
      setErro(e instanceof Error && !('code' in e) ? e.message : explain(e));
    }
    setBusy(false);
  }

  const muda = (patch: Partial<PromocaoDoGrupo>) => {
    setF((x) => ({ ...x, ...patch }));
    setSalvo(false);
  };

  return (
    <section className="mt-3 rounded-2xl border border-ink-800 bg-ink-900 p-4">
      <p className="flex items-center gap-2 text-[15px] font-semibold text-ink-50">
        <CalendarClock size={17} className="text-brand-400" />
        Inscrição em duas fases
      </p>
      <p className="mt-1 text-xs leading-relaxed text-ink-500">
        Um link e um grupo de WhatsApp só. Até a promoção, só mensalista tem vaga; convidado se inscreve e espera.
        Na promoção, os convidados sobem por ordem de inscrição.
      </p>

      <label className="mt-3 flex items-center justify-between gap-3">
        <span className="text-sm text-ink-200">Usar nos próximos jogos</span>
        <input
          type="checkbox"
          checked={ligada}
          onChange={(e) => muda(e.target.checked ? { dias: f.dias ?? 3, hora: f.hora ?? '20:00' } : { dias: null })}
          className="size-5 accent-brand-500"
        />
      </label>

      {ligada && (
        <div className="mt-3 flex flex-col gap-3">
          <div>
            <span className="text-xs font-medium text-ink-400">Convidados entram quantos dias antes do jogo</span>
            <div className="mt-1 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Dias antes do jogo">
              {DIAS_OPCOES.map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={f.dias === d}
                  onClick={() => muda({ dias: d })}
                  className={cn(
                    'min-w-10 rounded-xl border px-3 py-2 text-sm font-medium',
                    f.dias === d ? 'border-brand-500 bg-brand-500/15 text-brand-300' : 'border-ink-800 bg-ink-950 text-ink-400',
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="text-xs font-medium text-ink-400">A que horas</span>
            <input
              type="time"
              value={f.hora ?? '20:00'}
              onChange={(e) => muda({ hora: e.target.value })}
              className="mt-1 w-full rounded-xl bg-ink-800 px-3 py-2.5 text-[15px] text-ink-50 outline-none [color-scheme:dark]"
            />
          </label>
          <div>
            <span className="text-xs font-medium text-ink-400">Depois da promoção</span>
            <div className="mt-1 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Preferência do mensalista">
              {[
                { v: false, t: 'Ordem de chegada', d: 'Mensalista atrasado entra na espera como qualquer um' },
                { v: true, t: 'Mensalista na frente', d: 'Ele entra e o último convidado volta para a espera' },
              ].map((o) => (
                <button
                  key={o.t}
                  type="button"
                  role="radio"
                  aria-checked={f.preferenciaPermanente === o.v}
                  onClick={() => muda({ preferenciaPermanente: o.v })}
                  className={cn(
                    'rounded-xl border px-3 py-2.5 text-left',
                    f.preferenciaPermanente === o.v ? 'border-brand-500 bg-brand-500/10' : 'border-ink-800 bg-ink-950',
                  )}
                >
                  <span
                    className={cn(
                      'block text-sm font-semibold',
                      f.preferenciaPermanente === o.v ? 'text-brand-300' : 'text-ink-200',
                    )}
                  >
                    {o.t}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-ink-500">{o.d}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {erro && <p className="mt-2 text-sm text-red-300">{erro}</p>}
      {mudou && (
        <Button size="sm" className="mt-3 w-full" disabled={busy} onClick={salvar}>
          {busy ? 'Salvando…' : 'Salvar'}
        </Button>
      )}
      {!mudou && salvo && (
        <p className="mt-2 text-xs text-brand-300">
          Salvo. Vale para os jogos criados daqui em diante; os já marcados não mudam.
        </p>
      )}
    </section>
  );
}
