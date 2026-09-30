import { useNavigate } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { lerGrupoAtivo } from '@/lib/grupoAtivo';

/**
 * O nome do grupo no alto da tela é o seletor (docs/telas-amador.md, etapa
 * 8): toca e troca. Leva à lista dos grupos (`/modo`), que também cria um
 * grupo novo. Sem grupo ativo — quem usa só no aparelho —, não aparece.
 */
export function SeletorDeGrupo() {
  const navigate = useNavigate();
  const ativo = lerGrupoAtivo();
  if (!ativo) return null;
  return (
    <button
      onClick={() => navigate('/modo')}
      className="mt-0.5 flex max-w-full items-center gap-1 text-sm text-ink-400 active:text-ink-200"
      aria-label={`Grupo: ${ativo.name ?? 'sem nome'}. Trocar de grupo`}
    >
      <span className="truncate">{ativo.name ?? 'Grupo'}</span>
      <ChevronDown size={14} className="shrink-0" />
    </button>
  );
}
