import { useEffect, useMemo, useState } from 'react';
import { Check, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { diariasLancadas, findMyGroup, lancarDiarias, lerConfigFinanceiro } from '@/lib/cloud';
import { centavosParaCampo, reaisParaCentavos } from '@/lib/financeiro';
import { joga, vagasDoJogo } from '@/lib/vagas';
import { nomeDeExibicao } from '@/lib/nome';
import { cn } from '@/lib/utils';
import { explain } from '@/components/cloud/partes';
import type { Jogo, Player } from '@/types';

/**
 * A diária dos convidados de um jogo (migração 017), decidido pelo Guilherme
 * em 29/09/2026: ao encerrar, o app mostra os convidados que jogaram, já
 * marcados; ele desmarca quem faltou e confirma. O mesmo jogo não cobra duas
 * vezes a mesma pessoa — quem já tem a diária aparece como lançado.
 */
export function LancarDiarias({ jogo, players, onFechar }: { jogo: Jogo; players: Player[]; onFechar: () => void }) {
  const convidados = useMemo(() => {
    const dist = vagasDoJogo(jogo, players);
    return players.filter((p) => p.kind === 'convidado' && joga(dist.situacao.get(p.id)) && p.remoteId);
  }, [jogo, players]);
  const [valor, setValor] = useState('');
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(convidados.map((p) => p.id)));
  const [lancadas, setLancadas] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<number | null>(null);

  useEffect(() => {
    if (!jogo.remoteId) return;
    let vivo = true;
    Promise.all([findMyGroup('amador'), diariasLancadas(jogo.remoteId)])
      .then(async ([g, ja]) => {
        if (!vivo) return;
        setLancadas(ja);
        if (g) {
          const c = await lerConfigFinanceiro(g.id);
          if (vivo) setValor(centavosParaCampo(c.diariaCents));
        }
      })
      .catch((e) => vivo && setErro(explain(e)));
    return () => {
      vivo = false;
    };
  }, [jogo.remoteId]);

  const pendentes = convidados.filter((p) => marcados.has(p.id) && !lancadas?.has(p.remoteId!));
  const cents = reaisParaCentavos(valor);

  async function lancar() {
    if (!jogo.remoteId || !cents || pendentes.length === 0) return;
    setBusy(true);
    setErro(null);
    try {
      const n = await lancarDiarias(jogo.remoteId, pendentes.map((p) => p.remoteId!), cents);
      setFeito(n);
      setLancadas(await diariasLancadas(jogo.remoteId));
    } catch (e) {
      setErro(explain(e));
    }
    setBusy(false);
  }

  return (
    <section className="mt-3 rounded-2xl border border-brand-500/40 bg-ink-900 p-4">
      <p className="flex items-center gap-2 text-[15px] font-semibold text-ink-50">
        <Wallet size={17} className="text-brand-400" />
        Diária dos convidados
      </p>
      {convidados.length === 0 ? (
        <p className="mt-2 text-sm text-ink-400">Nenhum convidado jogou este jogo.</p>
      ) : lancadas === null && !erro ? (
        <p className="mt-2 text-sm text-ink-500">Carregando…</p>
      ) : (
        <>
          <p className="mt-1 text-xs leading-relaxed text-ink-500">
            Desmarque quem não apareceu. A diária vira cobrança no Financeiro.
          </p>
          <ul className="mt-3 flex flex-col gap-1.5">
            {convidados.map((p) => {
              const ja = lancadas?.has(p.remoteId!);
              const marcado = ja || marcados.has(p.id);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={ja}
                    onClick={() =>
                      setMarcados((m) => {
                        const n = new Set(m);
                        if (n.has(p.id)) n.delete(p.id);
                        else n.add(p.id);
                        return n;
                      })
                    }
                    className="flex w-full items-center gap-3 rounded-xl border border-ink-800 bg-ink-950 px-3 py-2.5 text-left"
                  >
                    <span
                      className={cn(
                        'flex size-6 shrink-0 items-center justify-center rounded-md border',
                        marcado ? 'border-brand-500 bg-brand-500 text-ink-950' : 'border-ink-600',
                      )}
                    >
                      {marcado && <Check size={15} strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[15px] text-ink-100">{nomeDeExibicao(p)}</span>
                    {ja && <span className="shrink-0 text-xs text-brand-300">já lançada</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          <label className="mt-3 block">
            <span className="text-xs text-ink-400">Diária (R$)</span>
            <input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              inputMode="decimal"
              placeholder="Ex.: 25,00"
              className="mt-1 w-full rounded-xl bg-ink-800 px-3 py-2.5 text-[15px] text-ink-50 placeholder:text-ink-500 outline-none"
            />
          </label>
          {feito !== null && (
            <p className="mt-2 text-sm text-brand-300">
              {feito === 1 ? '1 diária lançada. Está' : `${feito} diárias lançadas. Estão`} em Financeiro › Quem deve.
            </p>
          )}
          {erro && <p className="mt-2 text-sm text-red-300">{erro}</p>}
        </>
      )}
      <div className="mt-3 flex gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={onFechar}>
          {feito !== null || pendentes.length === 0 ? 'Fechar' : 'Agora não'}
        </Button>
        {pendentes.length > 0 && (
          <Button size="sm" className="flex-1" disabled={busy || !cents} onClick={lancar}>
            {busy
              ? 'Lançando…'
              : `Lançar ${pendentes.length} ${pendentes.length === 1 ? 'diária' : 'diárias'}`}
          </Button>
        )}
      </div>
    </section>
  );
}
