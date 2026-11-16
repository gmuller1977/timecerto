import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/store/useAuth';
import { configDoBloqueio, findActiveGroup, salvarConfigDoBloqueio, type ConfigDoBloqueio } from '@/lib/cloud';
import { formatPhone, isValidPhone, maskPhoneInput, onlyDigits } from '@/lib/phone';
import { explain } from '@/components/cloud/partes';
import { cn } from '@/lib/utils';

/**
 * Ajustes › Financeiro › Pagamento em atraso (migração 044, pedido do
 * Guilherme em 16/11/2026). Com o bloqueio ligado, quem tem cobrança vencida
 * não coloca o nome na lista pelo link. A diária do jogo vence N dias depois
 * do jogo (configurável); mensalidade e avulsa, no vencimento. O WhatsApp do
 * administrador vira o botão "Falar com o administrador" no link.
 * Sem a 044 no banco, o cartão não aparece.
 */
export function BloqueioPorPendencia() {
  const ready = useAuth((s) => s.ready);
  const session = useAuth((s) => s.session);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [cfg, setCfg] = useState<ConfigDoBloqueio | null>(null);
  const [fone, setFone] = useState('');
  const [nome, setNome] = useState('');
  const [prazo, setPrazo] = useState('3');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    if (!ready || !session) return;
    let vivo = true;
    findActiveGroup()
      .then(async (g) => {
        if (!vivo || !g) return;
        const c = await configDoBloqueio(g.id);
        if (!vivo || !c) return;
        setGroupId(g.id);
        setCfg(c);
        setFone(c.adminWhatsapp ? formatPhone(c.adminWhatsapp) : '');
        setNome(c.adminNome ?? '');
        setPrazo(String(c.prazoDiaria));
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [ready, session]);

  if (!ready || !session || !groupId || !cfg) return null;

  async function gravar(novo: ConfigDoBloqueio) {
    if (!groupId) return;
    setBusy(true);
    setErro(null);
    setSalvo(false);
    try {
      await salvarConfigDoBloqueio(groupId, novo);
      setCfg(novo);
      setSalvo(true);
    } catch (e) {
      setErro(e instanceof Error && !('code' in e) ? e.message : explain(e));
    }
    setBusy(false);
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!cfg) return;
    const digitos = onlyDigits(fone);
    if (digitos && !isValidPhone(digitos)) {
      setErro('WhatsApp com DDD, só números: (11) 98765-4321.');
      return;
    }
    const dias = Number(prazo);
    if (!Number.isInteger(dias) || dias < 0 || dias > 30) {
      setErro('O prazo da diária vai de 0 a 30 dias.');
      return;
    }
    void gravar({ ...cfg, adminWhatsapp: digitos || null, adminNome: nome.trim() || null, prazoDiaria: dias });
  }

  return (
    <section className="mt-3 rounded-2xl border border-ink-800 bg-ink-900 p-4">
      <p className="flex items-center gap-2 text-[15px] font-semibold text-ink-50">
        <Lock size={17} className="text-brand-400" />
        Pagamento em atraso
      </p>
      <p className="mt-1 text-xs leading-relaxed text-ink-400">
        Ligado: quem tem cobrança vencida não consegue colocar o nome na lista pelo link, e vê o que deve. Você
        continua podendo confirmar a pessoa pelo app.
      </p>

      <button
        type="button"
        role="switch"
        aria-checked={cfg.bloquear}
        disabled={busy}
        onClick={() => void gravar({ ...cfg, bloquear: !cfg.bloquear })}
        className="mt-3 flex w-full items-center justify-between rounded-xl bg-ink-800 px-3 py-3 text-left text-[15px] text-ink-50"
      >
        Bloquear a lista de quem está em atraso
        <span
          className={cn(
            'relative inline-block h-6 w-11 shrink-0 rounded-full transition-colors',
            cfg.bloquear ? 'bg-brand-500' : 'bg-ink-600',
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all',
              cfg.bloquear ? 'right-0.5' : 'left-0.5',
            )}
          />
        </span>
      </button>

      <form onSubmit={salvar} className="mt-3">
        <label className="block text-xs font-semibold text-ink-300">
          Prazo da diária do jogo (dias depois do jogo)
          <input
            value={prazo}
            onChange={(e) => setPrazo(e.target.value.replace(/\D/g, '').slice(0, 2))}
            inputMode="numeric"
            className="mt-1 w-full rounded-xl bg-ink-800 px-3 py-3 text-[15px] font-normal text-ink-50 outline-none"
          />
        </label>
        <p className="mt-1 text-[11px] leading-relaxed text-ink-500">
          Mensalidade e cobrança avulsa ficam em atraso no dia seguinte ao vencimento.
        </p>
        <label className="mt-3 block text-xs font-semibold text-ink-300">
          WhatsApp do administrador
          <input
            value={fone}
            onChange={(e) => setFone(maskPhoneInput(e.target.value))}
            inputMode="tel"
            placeholder="(11) 98765-4321"
            className="mt-1 w-full rounded-xl bg-ink-800 px-3 py-3 text-[15px] font-normal text-ink-50 placeholder:text-ink-500 outline-none"
          />
        </label>
        <label className="mt-3 block text-xs font-semibold text-ink-300">
          Nome que aparece no botão
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value.slice(0, 40))}
            placeholder="Ex.: Guilherme"
            className="mt-1 w-full rounded-xl bg-ink-800 px-3 py-3 text-[15px] font-normal text-ink-50 placeholder:text-ink-500 outline-none"
          />
        </label>
        <p className="mt-1 text-[11px] leading-relaxed text-ink-500">
          Vira o botão "Falar com o administrador" para quem está em atraso. Sem número, o botão não aparece.
        </p>
        {erro && <p className="mt-2 text-sm text-red-300">{erro}</p>}
        {salvo && !erro && <p className="mt-2 text-sm text-brand-200">Salvo.</p>}
        <Button type="submit" className="mt-3 w-full" disabled={busy}>
          Salvar
        </Button>
      </form>
    </section>
  );
}
