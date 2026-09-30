import { useAppStore } from '@/store/useAppStore';
import { useProStore } from '@/store/useProStore';
import { lerGrupoAtivo } from '@/lib/grupoAtivo';
import type { Player } from '@/types';

/**
 * Fase 2 do profissional (30/09/2026): o elenco do time sai do store próprio
 * (useProStore.players) e passa a morar no cadastro único (useAppStore.players),
 * o mesmo da pelada — é o que dá ao time a agenda, a confirmação pelo link e
 * a mensalidade.
 *
 * Roda no aparelho, uma vez por time: move quem está no store antigo e o
 * esvazia. Nada se perde:
 *
 * - quem já estava na nuvem leva o id dela (remoteId) e o link pessoal
 *   (inviteToken); sem updatedAt, a sincronização o trata como legado e a
 *   versão da nuvem vence — é a que o atleta pode ter completado pelo link;
 * - quem nunca subiu entra como novo e sobe na próxima rodada;
 * - quem já está no cadastro único (mesmo id ou mesmo id da nuvem) não duplica.
 *
 * Só com um TIME ativo: sem grupo, a chave antiga pode guardar a pelada e o
 * profissional misturados, e juntar ali mandaria o elenco para a pelada.
 */
export function unificarElenco() {
  if (lerGrupoAtivo()?.mode !== 'profissional') return;
  const antigos = useProStore.getState().players;
  if (antigos.length === 0) return;

  const atuais = useAppStore.getState().players;
  const ids = new Set(atuais.map((p) => p.id));
  const remotos = new Set(atuais.map((p) => p.remoteId).filter(Boolean));
  const novos: Player[] = antigos
    .filter((p) => !ids.has(p.id) && !(p.remoteId && remotos.has(p.remoteId)))
    .map((p) => ({
      id: p.id,
      name: p.name,
      skills: {},
      positions: p.position ? { volei: p.position } : {},
      kind: 'mensalista',
      createdAt: p.createdAt,
      birthDate: p.birthDate,
      ageGroup: p.ageGroup,
      naipe: p.naipe,
      heightCm: p.heightCm,
      weightKg: p.weightKg,
      remoteId: p.remoteId,
      inviteToken: p.inviteToken,
    }));

  // Primeiro grava no cadastro único; só depois esvazia o antigo
  if (novos.length > 0) useAppStore.setState({ players: [...atuais, ...novos] });
  useProStore.setState({ players: [] });
}
