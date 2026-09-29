import { useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/store/useAuth';
import { findMyGroup, lerConfigFinanceiro, salvarConfigFinanceiro, type ConfigFinanceiro } from '@/lib/cloud';
import { centavosParaCampo, reaisParaCentavos } from '@/lib/financeiro';
import { formatBRL } from '@/lib/utils';
import { explain } from '@/components/cloud/partes';

/**
 * Ajustes › Financeiro (migração 017): mensalidade e vencimento, diária do
 * convidado e o Pix que vai na cobrança. É o que liga o resto: sem mensalidade
 * não nasce cobrança do mês; sem Pix, a cobrança vai sem o copia e cola.
 */
export function FinanceiroAjustes() {
  const ready = useAuth((s) => s.ready);
  const session = useAuth((s) => s.session);
  const [grupo, setGrupo] = useState<string | null | undefined>(undefined);
  const [config, setConfig] = useState<ConfigFinanceiro | null>(null);
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState({ mensalidade: '', dia: '', diaria: '', chave: '', nome: '', cidade: '' });
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !session) return;
    let vivo = true;
    findMyGroup('amador')
      .then(async (g) => {
        if (!vivo) return;
        setGrupo(g?.id ?? null);
        if (g) {
          const c = await lerConfigFinanceiro(g.id);
          if (vivo) setConfig(c);
        }
      })
      .catch((e) => {
        console.warn('configuração do financeiro', e);
        if (vivo) setGrupo(null);
      });
    return () => {
      vivo = false;
    };
  }, [ready, session]);

  if (!ready || !session || !grupo || !config) return null;

  function abrir() {
    if (!config) return;
    setF({
      mensalidade: centavosParaCampo(config.mensalidadeCents),
      dia: config.mensalidadeDia ? String(config.mensalidadeDia) : '',
      diaria: centavosParaCampo(config.diariaCents),
      chave: config.pixChave ?? '',
      nome: config.pixNome ?? '',
      cidade: config.pixCidade ?? '',
    });
    setErro(null);
    setEditando(true);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!grupo) return;
    const mensalidade = f.mensalidade.trim() ? reaisParaCentavos(f.mensalidade) : null;
    const diaria = f.diaria.trim() ? reaisParaCentavos(f.diaria) : null;
    const dia = f.dia.trim() ? Number(f.dia) : null;
    if ((f.mensalidade.trim() && !mensalidade) || (f.diaria.trim() && !diaria)) {
      setErro('Valor inválido. Use, por exemplo, 80 ou 80,00.');
      return;
    }
    if (mensalidade && (!dia || !Number.isInteger(dia) || dia < 1 || dia > 28)) {
      setErro('Com mensalidade, escolha o dia do vencimento, de 1 a 28.');
      return;
    }
    if (f.chave.trim() && (!f.nome.trim() || !f.cidade.trim())) {
      setErro('O Pix copia e cola precisa do nome e da cidade de quem recebe, como aparecem no banco.');
      return;
    }
    const novo: ConfigFinanceiro = {
      mensalidadeCents: mensalidade,
      mensalidadeDia: mensalidade ? dia : null,
      diariaCents: diaria,
      pixChave: f.chave.trim() || null,
      pixNome: f.nome.trim() || null,
      pixCidade: f.cidade.trim() || null,
    };
    setBusy(true);
    setErro(null);
    try {
      await salvarConfigFinanceiro(grupo, novo);
      setConfig(novo);
      setEditando(false);
    } catch (err) {
      setErro(err instanceof Error && !('code' in err) ? err.message : explain(err));
    }
    setBusy(false);
  }

  const input = 'mt-1 w-full rounded-xl bg-ink-800 px-3 py-3 text-[15px] text-ink-50 placeholder:text-ink-500 outline-none';
  const rotulo = 'text-xs font-medium text-ink-400';

  return (
    <section className="mt-3 rounded-2xl border border-ink-800 bg-ink-900 p-4">
      <div className="flex items-center gap-2">
        <Wallet size={17} className="text-brand-400" />
        <p className="min-w-0 flex-1 text-[15px] font-semibold text-ink-50">Financeiro</p>
        {!editando && (
          <button onClick={abrir} className="rounded-lg border border-ink-800 px-2.5 py-1.5 text-xs text-ink-300">
            {config.mensalidadeCents || config.diariaCents || config.pixChave ? 'Editar' : 'Configurar'}
          </button>
        )}
      </div>

      {editando ? (
        <form onSubmit={salvar} className="mt-3 flex flex-col gap-3">
          <div className="flex gap-2">
            <label className="min-w-0 flex-[3]">
              <span className={rotulo}>Mensalidade (R$)</span>
              <input
                value={f.mensalidade}
                onChange={(e) => setF({ ...f, mensalidade: e.target.value })}
                inputMode="decimal"
                placeholder="Ex.: 80,00"
                className={input}
              />
            </label>
            <label className="min-w-0 flex-[2]">
              <span className={rotulo}>Vence no dia</span>
              <input
                value={f.dia}
                onChange={(e) => setF({ ...f, dia: e.target.value.replace(/\D/g, '').slice(0, 2) })}
                inputMode="numeric"
                placeholder="1 a 28"
                className={input}
              />
            </label>
          </div>
          <label>
            <span className={rotulo}>Diária do convidado (R$)</span>
            <input
              value={f.diaria}
              onChange={(e) => setF({ ...f, diaria: e.target.value })}
              inputMode="decimal"
              placeholder="Ex.: 25,00"
              className={input}
            />
          </label>
          <div className="border-t border-ink-800 pt-3">
            <p className="text-xs leading-relaxed text-ink-500">
              O Pix vai na mensagem de cobrança, já com o valor. O dinheiro cai direto na sua conta — o app
              não passa por banco nenhum.
            </p>
            <label className="mt-2 block">
              <span className={rotulo}>Chave Pix</span>
              <input
                value={f.chave}
                onChange={(e) => setF({ ...f, chave: e.target.value })}
                maxLength={77}
                placeholder="E-mail, CPF, +55 e celular, ou chave aleatória"
                className={input}
              />
            </label>
            <div className="mt-3 flex gap-2">
              <label className="min-w-0 flex-[3]">
                <span className={rotulo}>Nome de quem recebe</span>
                <input
                  value={f.nome}
                  onChange={(e) => setF({ ...f, nome: e.target.value })}
                  maxLength={25}
                  placeholder="Como aparece no banco"
                  className={input}
                />
              </label>
              <label className="min-w-0 flex-[2]">
                <span className={rotulo}>Cidade</span>
                <input
                  value={f.cidade}
                  onChange={(e) => setF({ ...f, cidade: e.target.value })}
                  maxLength={15}
                  placeholder="Ex.: Curitiba"
                  className={input}
                />
              </label>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-500">
              Celular como chave vai com +55 na frente: +5541999998888.
            </p>
          </div>
          {erro && <p className="text-sm text-red-300">{erro}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={busy}>
              {busy ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-2 flex flex-col gap-1 text-sm text-ink-300">
          <p>
            Mensalidade:{' '}
            <strong className="text-ink-100">
              {config.mensalidadeCents
                ? `${formatBRL(config.mensalidadeCents)}, vence dia ${config.mensalidadeDia}`
                : 'não configurada'}
            </strong>
          </p>
          <p>
            Diária do convidado:{' '}
            <strong className="text-ink-100">
              {config.diariaCents ? formatBRL(config.diariaCents) : 'não configurada'}
            </strong>
          </p>
          <p>
            Pix: <strong className="text-ink-100">{config.pixChave ? config.pixChave : 'sem chave'}</strong>
          </p>
        </div>
      )}
    </section>
  );
}
