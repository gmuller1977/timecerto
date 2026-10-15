import { useState } from 'react';
import { Link2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { lerGrupoAtivo } from '@/lib/grupoAtivo';
import type { LiveMatch } from '@/store/useMatchStore';

/**
 * Scout pelo link (migração 041, pedido do Guilherme em 15/10/2026). A partida
 * sobe para a nuvem e quem abrir o link passa a marcar; este aparelho para de
 * marcar e acompanha ao vivo, como os outros administradores. Duas fontes
 * marcando a mesma partida não se juntam — por isso ela sai daqui.
 */
export function PassarParaOLink({
  live,
  onClose,
  onCriado,
}: {
  live: LiveMatch;
  onClose: () => void;
  onCriado: (id: string) => void;
}) {
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const grupo = lerGrupoAtivo();

  async function criar() {
    if (!grupo) return;
    if (!navigator.onLine) {
      setErro('Sem internet. Conecte e tente de novo; a partida continua aqui.');
      return;
    }
    setCriando(true);
    setErro(null);
    try {
      const { criarLinkDeScout } = await import('@/lib/cloud');
      const { id } = await criarLinkDeScout(grupo.id, live);
      onCriado(id);
    } catch (e) {
      console.error('criar o link do scout', e);
      setErro('Não deu para criar o link. A partida continua aqui; tente de novo.');
      setCriando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/70" onClick={criando ? undefined : onClose} />
      <div className="safe-bottom relative rounded-t-3xl border-t border-ink-700 bg-ink-900 px-4 pt-4 pb-6">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink-700" />
        <p className="flex items-center gap-2 text-[15px] font-semibold text-ink-50">
          <Link2 size={18} className="text-brand-400" />
          Passar o scout para um link
        </p>
        <ul className="mt-3 flex flex-col gap-2 text-sm leading-relaxed text-ink-300">
          <li>Quem abrir o link marca os pontos, o tipo de ponto e o jogador, no detalhe de scout escolhido aqui. Não precisa ser administrador nem ter conta.</li>
          <li>Só um celular por vez: se outra pessoa abrir, vê que o link está em uso.</li>
          <li>Este aparelho para de marcar e passa a acompanhar ao vivo, como os outros administradores. Ao encerrar pelo link, a partida vai para o histórico de todos.</li>
        </ul>

        {!grupo && (
          <p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
            O link precisa de um grupo na nuvem. Entre no grupo em Ajustes e comece a partida de novo.
          </p>
        )}
        {erro && <p className="mt-3 text-sm text-red-400">{erro}</p>}

        <div className="mt-5 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={criando}>
            Agora não
          </Button>
          <Button className="flex-1" onClick={criar} disabled={!grupo || criando}>
            {criando ? 'Criando…' : 'Criar o link'}
          </Button>
        </div>
      </div>
    </div>
  );
}
