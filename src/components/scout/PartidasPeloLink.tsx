import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Radio } from 'lucide-react';
import { hasSavedSession } from '@/lib/sessao';
import { useGrupoAtivo } from '@/store/useGrupoAtivo';
import type { PartidaAoVivo } from '@/lib/cloud';

/**
 * As partidas do grupo sendo marcadas por link agora (migração 041): um
 * cartão por partida, que abre o acompanhamento ao vivo. Todos os
 * administradores veem, não só quem criou o link.
 */
export function PartidasPeloLink() {
  const navigate = useNavigate();
  const grupo = useGrupoAtivo();
  const [partidas, setPartidas] = useState<PartidaAoVivo[]>([]);

  useEffect(() => {
    if (!grupo || !hasSavedSession()) return;
    let vivo = true;
    const ler = () => {
      if (!navigator.onLine || document.visibilityState !== 'visible') return;
      import('@/lib/cloud')
        .then((m) => m.partidasAoVivo(grupo.id))
        .then((p) => vivo && setPartidas(p))
        .catch((e) => console.warn('partidas pelo link', e));
    };
    ler();
    const t = setInterval(ler, 10_000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [grupo]);

  if (partidas.length === 0) return null;
  return (
    <div className="mb-4 flex flex-col gap-2">
      {partidas.map((p) => {
        const set = p.estado.sets[p.estado.sets.length - 1];
        return (
          <button
            key={p.id}
            onClick={() => navigate(`/ao-vivo/${p.id}`)}
            className="flex w-full items-center gap-3 rounded-2xl border border-brand-500/40 bg-brand-500/10 px-4 py-3 text-left"
          >
            <Radio size={18} className="shrink-0 animate-pulse text-brand-400" />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-brand-200">Ao vivo pelo link</span>
              <span className="block truncate text-xs text-brand-300/70">
                {p.estado.teams[0].name} {set.scoreA} × {set.scoreB} {p.estado.teams[1].name} ·{' '}
                {p.estado.sets.length}º set
              </span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-brand-400" />
          </button>
        );
      })}
    </div>
  );
}
