import { useEffect, useState } from 'react';
import { Check, Crown, Lock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/store/useAuth';
import { useAppStore } from '@/store/useAppStore';
import { findActiveGroup, type CloudGroup } from '@/lib/cloud';
import { LIMITE_MENSALISTAS_GRATIS, PRECO_DO_PLANO_CENTS, situacaoDoPlano } from '@/lib/plano';
import { formatBRL } from '@/lib/utils';

const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

/**
 * Ajustes › Plano (migração 021). Diz em que plano o grupo está, até quando, e
 * o que o pago libera. A assinatura pelo Mercado Pago é a fase 2: até lá o
 * botão aparece, desligado, para o dono saber que ela vem.
 */
export function PlanoDoGrupo() {
  const ready = useAuth((s) => s.ready);
  const session = useAuth((s) => s.session);
  const [group, setGroup] = useState<CloudGroup | null | undefined>(undefined);
  const mensalistas = useAppStore((s) => s.players.filter((p) => !p.pending && p.kind !== 'convidado').length);
  // No time, todo atleta do elenco conta — no cadastro único desde a fase 2
  const atletasDoTime = useAppStore((s) => s.players.filter((p) => !p.pending).length);
  const pro = (useAppStore((s) => s.mode) ?? 'amador') === 'profissional';

  useEffect(() => {
    if (!ready || !session) return;
    let vivo = true;
    findActiveGroup()
      .then((g) => vivo && setGroup(g))
      .catch(() => vivo && setGroup(null));
    return () => {
      vivo = false;
    };
  }, [ready, session]);

  if (!ready || !session || !group) return null;
  const sit = situacaoDoPlano(group.plano);
  const souDono = group.ownerId === session.user.id;

  const titulo =
    sit.tipo === 'cortesia'
      ? 'Plano pago · cortesia'
      : sit.tipo === 'pago'
        ? 'Plano pago'
        : sit.tipo === 'teste'
          ? 'Teste do plano pago'
          : 'Plano grátis';
  const detalhe =
    sit.tipo === 'cortesia'
      ? 'Tudo liberado, sem prazo.'
      : sit.tipo === 'pago'
        ? `Assinatura em dia até ${data(sit.ate!)}.`
        : sit.tipo === 'teste'
          ? `${sit.dias === 1 ? 'Falta 1 dia' : `Faltam ${sit.dias} dias`}, até ${data(sit.ate!)}. Depois, sem assinatura, o grupo passa para o grátis — nada se perde, só trava.`
          : `Financeiro só para consulta, um administrador e até 20 ${pro ? 'atletas' : 'mensalistas'}. Nada do que já existe se perdeu.`;

  const itens = [
    'Financeiro: mensalidades, diárias, Pix, cobranças e caixa',
    'Mais de um administrador',
    pro
      ? `Mais de ${LIMITE_MENSALISTAS_GRATIS} atletas no elenco (hoje: ${atletasDoTime})`
      : `Mais de ${LIMITE_MENSALISTAS_GRATIS} mensalistas (hoje: ${mensalistas}). Convidados nunca contam`,
  ];

  return (
    <section className="mt-3 rounded-2xl border border-ink-800 bg-ink-900 p-4">
      <p className="flex items-center gap-2 text-[15px] font-semibold text-ink-50">
        <Crown size={17} className="text-brand-400" />
        Plano
      </p>
      <div
        className={`mt-3 rounded-xl px-3 py-2.5 ${sit.premium ? 'border border-brand-500/30 bg-brand-500/10' : 'border border-amber-500/30 bg-amber-500/10'}`}
      >
        <p className={`text-sm font-semibold ${sit.premium ? 'text-brand-100' : 'text-amber-100'}`}>{titulo}</p>
        <p className={`mt-0.5 text-xs leading-relaxed ${sit.premium ? 'text-brand-100/80' : 'text-amber-100/80'}`}>
          {detalhe}
        </p>
      </div>

      {!sit.premium && !souDono && (
        <p className="mt-2 text-xs leading-relaxed text-amber-200">
          Sem o plano, só o dono edita. Você continua vendo tudo, mas o que mudar fica só neste aparelho e não vai
          para o grupo.
        </p>
      )}

      <p className="mt-3 text-xs font-medium text-ink-400">O plano pago libera</p>
      <ul className="mt-1.5 flex flex-col gap-1.5">
        {itens.map((t) => (
          <li key={t} className="flex items-start gap-2 text-sm text-ink-200">
            {sit.premium ? (
              <Check size={15} className="mt-0.5 shrink-0 text-brand-400" />
            ) : (
              <Lock size={14} className="mt-0.5 shrink-0 text-ink-500" />
            )}
            {t}
          </li>
        ))}
      </ul>

      {sit.tipo !== 'cortesia' && sit.tipo !== 'pago' && (
        <>
          <p className="mt-3 text-sm text-ink-300">
            <strong className="text-ink-50">{formatBRL(PRECO_DO_PLANO_CENTS)} por mês</strong>, para o grupo todo.
          </p>
          {souDono ? (
            <>
              <Button className="mt-3 w-full" disabled>
                Assinar
              </Button>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
                A assinatura pelo Mercado Pago chega em breve.
              </p>
            </>
          ) : (
            <p className="mt-2 text-[11px] leading-relaxed text-ink-500">Quem assina é o dono do grupo.</p>
          )}
        </>
      )}
    </section>
  );
}
