import { lazy, Suspense, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Bell,
  CalendarClock,
  ChevronRight,
  Crown,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { hasSavedSession } from '@/lib/sessao';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';

// Cada seção traz o Supabase: só carrega quando é aberta
const NomeDoGrupo = lazy(() => import('@/components/cloud/NomeDoGrupo').then((m) => ({ default: m.NomeDoGrupo })));
const PerfilDoTime = lazy(() => import('@/components/cloud/PerfilDoTime').then((m) => ({ default: m.PerfilDoTime })));
const PlanoDoGrupo = lazy(() => import('@/components/cloud/PlanoDoGrupo').then((m) => ({ default: m.PlanoDoGrupo })));
const FinanceiroAjustes = lazy(() =>
  import('@/components/cloud/FinanceiroAjustes').then((m) => ({ default: m.FinanceiroAjustes })),
);
const Administradores = lazy(() =>
  import('@/components/cloud/Administradores').then((m) => ({ default: m.Administradores })),
);
const PromocaoAjustes = lazy(() =>
  import('@/components/cloud/PromocaoAjustes').then((m) => ({ default: m.PromocaoAjustes })),
);
const AvisosDoAdmin = lazy(() => import('@/components/cloud/Avisos').then((m) => ({ default: m.AvisosDoAdmin })));
const SairDaConta = lazy(() => import('@/components/cloud/SairDaConta').then((m) => ({ default: m.SairDaConta })));
const ExcluirGrupo = lazy(() => import('@/components/cloud/ExcluirGrupo').then((m) => ({ default: m.ExcluirGrupo })));

interface Secao {
  id: string;
  titulo: string;
  resumo: string;
  icone: LucideIcon;
  /** Só com conta (o que mora na nuvem) */
  conta?: boolean;
  /** Só no amador */
  pelada?: boolean;
  perigo?: boolean;
  conteudo: () => ReactNode;
}

/**
 * Ajustes em seções (pedido do Guilherme em 06/10/2026): a tela abre com um
 * menu, e cada assunto tem a sua tela, com a seta para voltar. Antes era uma
 * página só, com todos os cartões empilhados.
 */
const SECOES: Secao[] = [
  {
    id: 'grupo',
    titulo: 'Grupo',
    resumo: 'Nome do grupo',
    icone: Users,
    conta: true,
    conteudo: () => (
      <>
        <NomeDoGrupo />
        <PerfilDoTime />
      </>
    ),
  },
  { id: 'plano', titulo: 'Plano', resumo: 'Teste, plano pago e cortesia', icone: Crown, conta: true, conteudo: () => <PlanoDoGrupo /> },
  {
    id: 'financeiro',
    titulo: 'Financeiro',
    resumo: 'Mensalidade, diária, Pix e caixa',
    icone: Wallet,
    conta: true,
    conteudo: () => <FinanceiroAjustes />,
  },
  {
    id: 'administradores',
    titulo: 'Administradores',
    resumo: 'Quem mais cuida do grupo',
    icone: ShieldCheck,
    conta: true,
    conteudo: () => <Administradores />,
  },
  {
    id: 'inscricao',
    titulo: 'Inscrição em duas fases',
    resumo: 'Quando os convidados entram na lista',
    icone: CalendarClock,
    conta: true,
    pelada: true,
    conteudo: () => <PromocaoAjustes />,
  },
  {
    id: 'avisos',
    titulo: 'Avisos no celular',
    resumo: 'Quem saiu, quem aceitou a vaga',
    icone: Bell,
    conta: true,
    pelada: true,
    conteudo: () => <AvisosDoAdmin />,
  },
  {
    id: 'conta',
    titulo: 'Conta',
    resumo: 'Sair e trocar de modo',
    icone: UserRound,
    conteudo: () => (
      <>
        <SairDaConta />
        <Link
          to="/modo"
          className="mt-3 flex items-center justify-between rounded-2xl border border-ink-800 bg-ink-900 px-4 py-3.5 text-[15px] font-medium text-ink-100"
        >
          Trocar de modo
          <span className="text-xs text-ink-500">Amador · Profissional</span>
        </Link>
      </>
    ),
  },
  // Por último: é a ação que não tem volta
  {
    id: 'excluir',
    titulo: 'Excluir grupo',
    resumo: 'Apaga o grupo e tudo dele',
    icone: Trash2,
    conta: true,
    perigo: true,
    conteudo: () => <ExcluirGrupo />,
  },
];

function useSecoes(): Secao[] {
  const pelada = (useAppStore((s) => s.mode) ?? 'amador') === 'amador';
  const comConta = hasSavedSession();
  return SECOES.filter((s) => (!s.conta || comConta) && (!s.pelada || pelada));
}

export function AjustesPage() {
  const secoes = useSecoes();
  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-10">
      <header className="safe-top pt-6 pb-4">
        <h1 className="text-2xl font-bold tracking-tight">Ajustes</h1>
      </header>
      <nav className="flex flex-col gap-2" aria-label="Seções dos ajustes">
        {secoes.map((s) => (
          <Link
            key={s.id}
            to={`/ajustes/${s.id}`}
            className={cn(
              'flex items-center gap-3 rounded-2xl border bg-ink-900 px-4 py-3.5 active:scale-[0.99]',
              s.perigo ? 'mt-4 border-red-500/30' : 'border-ink-800',
            )}
          >
            <span
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-xl',
                s.perigo ? 'bg-red-500/10 text-red-300' : 'bg-brand-500/10 text-brand-300',
              )}
            >
              <s.icone size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn('block text-[15px] font-semibold', s.perigo ? 'text-red-200' : 'text-ink-50')}>
                {s.titulo}
              </span>
              <span className="block truncate text-xs text-ink-500">{s.resumo}</span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-ink-600" />
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function SecaoDosAjustesPage() {
  const { secao } = useParams();
  const navigate = useNavigate();
  const s = useSecoes().find((x) => x.id === secao);
  if (!s) return <Navigate to="/ajustes" replace />;
  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-10">
      <header className="safe-top flex items-center gap-2 pt-6 pb-2">
        <button onClick={() => navigate('/ajustes')} className="-ml-1 p-1 text-ink-400" aria-label="Voltar aos ajustes">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-xl font-bold tracking-tight">{s.titulo}</h1>
      </header>
      <Suspense fallback={<p className="mt-4 text-sm text-ink-500">Carregando…</p>}>{s.conteudo()}</Suspense>
    </div>
  );
}
