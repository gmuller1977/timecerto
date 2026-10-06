import { useEffect, useState } from 'react';
import { Check, Crown, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/store/useAuth';
import { useAppStore } from '@/store/useAppStore';
import { findActiveGroup, type CloudGroup } from '@/lib/cloud';
import { LIMITE_MENSALISTAS_GRATIS, PRECO_DO_PLANO_CENTS, PRECO_DO_VIP_CENTS, situacaoDoPlano } from '@/lib/plano';
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

  const faltam = (n: number | null) => (n === 1 ? 'Falta 1 dia' : `Faltam ${n} dias`);
  const titulo =
    sit.tipo === 'cortesia'
      ? pro
        ? 'VIP · cortesia'
        : 'Plano pago · cortesia'
      : sit.tipo === 'vip'
        ? 'VIP'
        : sit.tipo === 'teste_vip'
          ? 'Teste do VIP'
          : sit.tipo === 'pago'
            ? 'Plano pago'
            : sit.tipo === 'teste'
              ? 'Teste do plano pago'
              : pro
                ? 'Sem VIP'
                : 'Plano grátis';
  const detalhe =
    sit.tipo === 'cortesia'
      ? 'Tudo liberado, sem prazo.'
      : sit.tipo === 'vip' || sit.tipo === 'pago'
        ? `Assinatura em dia até ${data(sit.ate!)}.`
        : sit.tipo === 'teste_vip'
          ? `${faltam(sit.dias)}, até ${data(sit.ate!)}. O teste é um só por conta e vale para todos os seus times. Depois, sem o VIP, os times ficam só para consulta — nada se perde, só trava.`
          : sit.tipo === 'teste'
            ? `${faltam(sit.dias)}, até ${data(sit.ate!)}. Depois, sem assinatura, o grupo passa para o grátis — nada se perde, só trava.`
            : pro
              ? `O teste do VIP terminou${group.plano.vipTesteAte ? ` em ${data(group.plano.vipTesteAte)}` : ''}. O time fica só para consulta: dá para ver elenco, jogos e estatísticas, mas criar jogo e escalar pedem o VIP.`
              : `Financeiro só para consulta, um administrador e até 20 mensalistas. Nada do que já existe se perdeu.`;

  const quem = pro ? 'atletas' : 'mensalistas';
  const hoje = pro ? atletasDoTime : mensalistas;
  /*
   * Os dois planos lado a lado (pedido do Guilherme em 06/10/2026): antes a
   * tela mostrava só o plano em uso. O que o grátis tem é o app inteiro; o que
   * o pago acrescenta é o que o banco trava sem ele (migração 021).
   */
  const gratis = [
    { t: 'Agenda, confirmação pelo link e lista de espera', ok: true },
    { t: 'Sorteio dos times, placar e estatísticas', ok: true },
    { t: 'Avisos no celular', ok: true },
    { t: 'Financeiro só para consulta', ok: false },
    { t: 'Um administrador', ok: false },
    { t: `Até ${LIMITE_MENSALISTAS_GRATIS} ${quem}${pro ? '' : ' (convidados não contam)'}`, ok: false },
  ];
  const pago = [
    { t: 'Tudo do grátis', ok: true },
    { t: 'Financeiro completo: mensalidades, diárias, Pix, cobranças e caixa', ok: true },
    { t: 'Mais de um administrador', ok: true },
    { t: `${quem[0].toUpperCase()}${quem.slice(1)} sem limite (hoje: ${hoje})`, ok: true },
  ];
  // VIP (migração 037): tudo do Pago + o modo profissional
  const vip = [
    { t: 'Tudo do Pago', ok: true },
    { t: 'Modo profissional: elenco com categoria e naipe, escalação e scout por atleta', ok: true },
    { t: 'Amistosos e campeonatos', ok: true },
    { t: '30 dias de teste, uma vez por conta', ok: true },
  ];
  // Qual cartão é o "Seu plano": cortesia é tudo liberado, cai no de cima
  const atual: 'gratis' | 'pago' | 'vip' =
    sit.tipo === 'vip' || sit.tipo === 'teste_vip' || (sit.tipo === 'cortesia' && pro)
      ? 'vip'
      : sit.tipo === 'pago' || sit.tipo === 'teste' || sit.tipo === 'cortesia'
        ? 'pago'
        : 'gratis';

  // O teste sempre aparece com a data — inclusive para quem já assinou ou é cortesia
  // No time profissional, o teste que importa é o do VIP (migração 037)
  const testeIso = pro ? group.plano.vipTesteAte : group.plano.testeAte;
  const nomeDoTeste = pro ? 'Teste do VIP' : 'Teste do plano pago';
  const linhaDoTeste =
    testeIso && !(pro && sit.tipo === 'gratis')
      ? new Date(testeIso) > new Date()
        ? `${nomeDoTeste} até ${data(testeIso)}`
        : `${nomeDoTeste} terminou em ${data(testeIso)}`
      : null;

  const cartao = ({
    nome,
    preco,
    lista,
    atual,
  }: {
    nome: string;
    preco: string;
    lista: { t: string; ok: boolean }[];
    atual: boolean;
  }) => (
    <div
      className={cn(
        'rounded-xl border p-3',
        atual ? 'border-brand-500/50 bg-brand-500/10' : 'border-ink-800 bg-ink-950',
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[15px] font-semibold text-ink-50">{nome}</p>
        {atual && (
          <span className="shrink-0 rounded-md bg-brand-500 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-ink-950 uppercase">
            Seu plano
          </span>
        )}
      </div>
      <p className="text-sm text-ink-300">{preco}</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {lista.map((i) => (
          <li key={i.t} className="flex items-start gap-2 text-[13px] leading-snug text-ink-200">
            {i.ok ? (
              <Check size={14} className="mt-0.5 shrink-0 text-brand-400" />
            ) : (
              <Lock size={13} className="mt-0.5 shrink-0 text-ink-500" />
            )}
            {i.t}
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <section className="mt-3 rounded-2xl border border-ink-800 bg-ink-900 p-4">
      <p data-titulo-da-secao className="flex items-center gap-2 text-[15px] font-semibold text-ink-50">
        <Crown size={17} className="text-brand-400" />
        Plano
      </p>

      {/* Agora */}
      <div
        className={`mt-3 rounded-xl px-3 py-2.5 ${sit.premium ? 'border border-brand-500/30 bg-brand-500/10' : 'border border-amber-500/30 bg-amber-500/10'}`}
      >
        <p className={`text-sm font-semibold ${sit.premium ? 'text-brand-100' : 'text-amber-100'}`}>{titulo}</p>
        <p className={`mt-0.5 text-xs leading-relaxed ${sit.premium ? 'text-brand-100/80' : 'text-amber-100/80'}`}>
          {detalhe}
        </p>
        {linhaDoTeste && sit.tipo !== 'teste' && sit.tipo !== 'teste_vip' && (
          <p className={`mt-1 text-xs ${sit.premium ? 'text-brand-100/70' : 'text-amber-100/70'}`}>{linhaDoTeste}</p>
        )}
      </div>

      {!sit.premium && !souDono && (
        <p className="mt-2 text-xs leading-relaxed text-amber-200">
          Sem o plano, só o dono edita. Você continua vendo tudo, mas o que mudar fica só neste aparelho e não vai
          para o grupo.
        </p>
      )}

      {/* Os três planos */}
      <div className="mt-3 flex flex-col gap-2">
        {cartao({ nome: 'Grátis', preco: 'R$ 0', lista: gratis, atual: atual === 'gratis' })}
        {cartao({
          nome: 'Pago',
          preco: `${formatBRL(PRECO_DO_PLANO_CENTS)} por mês, para o grupo todo`,
          lista: pago,
          atual: atual === 'pago',
        })}
        {cartao({
          nome: 'VIP',
          preco: `${formatBRL(PRECO_DO_VIP_CENTS)} por mês`,
          lista: vip,
          atual: atual === 'vip',
        })}
      </div>

      {sit.tipo !== 'cortesia' && sit.tipo !== 'pago' && sit.tipo !== 'vip' && (
        <>
          {souDono ? (
            <>
              <Button className="mt-3 w-full" disabled>
                {pro ? 'Assinar o VIP' : 'Assinar'}
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
