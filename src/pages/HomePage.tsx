import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Check, ChevronRight, ClipboardList, Plus, Radio, Shuffle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useMatchStore } from '@/store/useMatchStore';
import { ativarGrupo, sairDoGrupo } from '@/store/trocarGrupo';
import { lerGrupoAtivo } from '@/lib/grupoAtivo';
import { SPORT_LIST } from '@/lib/sports';
import { hasSavedSession } from '@/lib/sessao';
import type { MeuGrupo } from '@/lib/cloud';
import type { AppMode } from '@/types';
import { cn } from '@/lib/utils';

const INICIO: Record<AppMode, string> = { amador: '/amador', profissional: '/profissional/jogo' };
const NOME_DO_TIPO: Record<AppMode, string> = { amador: 'Pelada', profissional: 'Time profissional' };

const MODES: {
  id: AppMode;
  title: string;
  tagline: string;
  detail: string;
  icon: typeof Shuffle;
  sports: string;
}[] = [
  {
    id: 'amador',
    title: 'Amador',
    tagline: 'Pelada, racha, time de amigos',
    detail:
      'Cadastre quem veio, sorteie times equilibrados por nível e posição, compartilhe no WhatsApp e acompanhe o placar.',
    icon: Shuffle,
    sports: SPORT_LIST.map((s) => s.emoji).join(' '),
  },
  {
    id: 'profissional',
    title: 'Profissional',
    tagline: 'Treinador, time fixo, competição',
    detail:
      'Elenco com categoria, altura e peso. Escale o time na quadra, acompanhe rodízio e substituições, com placar e scout completo.',
    icon: ClipboardList,
    sports: '🏐',
  },
];

/**
 * A escolha do grupo (`/modo`). Desde a etapa 7 não é a abertura; desde a
 * etapa 8 (docs/telas-amador.md) é a lista dos grupos da conta — escolher o
 * grupo é escolher o tipo, e o app se configura sozinho. Aparece na primeira
 * entrada, quando a conta tem mais de um grupo e o aparelho não lembra qual,
 * e pelo nome do grupo no alto das telas.
 *
 * Sem grupo nenhum (ou sem rede), mostra os dois tipos, como sempre: o grupo
 * nasce depois, na primeira vez que se convida alguém.
 */
export function HomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const live = useMatchStore((s) => s.live);
  const [grupos, setGrupos] = useState<MeuGrupo[] | null>(null);
  const [ativo] = useState(() => lerGrupoAtivo()?.id ?? null);
  // A faixa do grupo manda para cá com "criar" já aberto
  const [criando, setCriando] = useState(() => Boolean((location.state as { criar?: boolean } | null)?.criar));
  const [tipoNovo, setTipoNovo] = useState<AppMode>('amador');
  const [nomeNovo, setNomeNovo] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!hasSavedSession()) return;
    let vivo = true;
    import('@/lib/cloud')
      .then(({ meusGrupos }) => meusGrupos())
      .then((lista) => vivo && setGrupos(lista))
      .catch(() => {
        /* sem rede: ficam os dois tipos */
      });
    return () => {
      vivo = false;
    };
  }, []);

  async function abrir(g: MeuGrupo) {
    setBusy(true);
    await ativarGrupo({ id: g.id, mode: g.mode, name: g.name });
    navigate(INICIO[g.mode], { replace: true });
  }

  // Tipo sem grupo ainda: o aparelho sai de qualquer grupo e usa o que já
  // tinha daquele tipo; o grupo nasce ao convidar alguém, e leva isso junto
  async function comecar(mode: AppMode) {
    await sairDoGrupo(mode);
    navigate(INICIO[mode]);
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    const nome = nomeNovo.trim();
    if (nome.length < 2) return setErro('Dê um nome ao grupo.');
    setBusy(true);
    setErro(null);
    try {
      const { createGroup } = await import('@/lib/cloud');
      await createGroup(tipoNovo, nome);
      navigate(INICIO[tipoNovo], { replace: true });
    } catch {
      setErro('Não deu para criar o grupo. Confira a internet e tente de novo.');
      setBusy(false);
    }
  }

  const temGrupos = grupos !== null && grupos.length > 0;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-10">
      <header className="safe-top flex items-start justify-between gap-3 pt-10 pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Time<span className="text-brand-400">Certo</span>
          </h1>
          <p className="mt-1 text-sm text-ink-400">
            {temGrupos ? 'Qual grupo você vai abrir?' : 'Como você joga hoje?'}
          </p>
        </div>
      </header>

      {live && (
        <button
          onClick={() => navigate('/placar')}
          className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-brand-500/40 bg-brand-500/10 px-4 py-3 text-left"
        >
          <Radio size={18} className="shrink-0 animate-pulse text-brand-400" />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-brand-200">Partida em andamento</span>
            <span className="block truncate text-xs text-brand-300/70">
              {live.teams[0].name} {live.sets[live.sets.length - 1].scoreA} ×{' '}
              {live.sets[live.sets.length - 1].scoreB} {live.teams[1].name}
            </span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-brand-400" />
        </button>
      )}

      {temGrupos ? (
        <>
          <div className="flex flex-col gap-2">
            {grupos.map((g) => {
              const Icon = g.mode === 'profissional' ? ClipboardList : Shuffle;
              return (
                <button
                  key={g.id}
                  disabled={busy}
                  onClick={() => abrir(g)}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl border bg-ink-900 px-4 py-3.5 text-left active:scale-[0.99]',
                    g.id === ativo ? 'border-brand-500/50' : 'border-ink-800',
                  )}
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300">
                    <Icon size={20} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-semibold text-ink-50">{g.name}</span>
                    <span className="block text-xs text-ink-400">
                      {NOME_DO_TIPO[g.mode]} · {g.papel === 'dono' ? 'você é o dono' : 'você é administrador'}
                    </span>
                  </span>
                  {g.id === ativo ? (
                    <Check size={18} className="shrink-0 text-brand-400" />
                  ) : (
                    <ChevronRight size={18} className="shrink-0 text-ink-500" />
                  )}
                </button>
              );
            })}
          </div>

          {criando ? (
            <form onSubmit={criar} className="mt-4 flex flex-col gap-3 rounded-2xl border border-ink-800 bg-ink-900 p-4">
              <p className="text-[15px] font-semibold text-ink-50">Novo grupo</p>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo do grupo">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={tipoNovo === m.id}
                    onClick={() => setTipoNovo(m.id)}
                    className={cn(
                      'rounded-xl border px-3 py-2.5 text-left',
                      tipoNovo === m.id ? 'border-brand-500 bg-brand-500/10' : 'border-ink-800 bg-ink-950',
                    )}
                  >
                    <span
                      className={cn('block text-sm font-semibold', tipoNovo === m.id ? 'text-brand-300' : 'text-ink-200')}
                    >
                      {m.title}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-ink-500">{m.tagline}</span>
                  </button>
                ))}
              </div>
              <input
                value={nomeNovo}
                onChange={(e) => setNomeNovo(e.target.value)}
                maxLength={40}
                placeholder={tipoNovo === 'amador' ? 'Nome (ex.: Pelada de quinta)' : 'Nome (ex.: Sub-17 feminino)'}
                aria-label="Nome do grupo"
                className="w-full rounded-xl bg-ink-800 px-3 py-3 text-[15px] text-ink-50 placeholder:text-ink-500 outline-none"
              />
              {erro && <p className="text-sm text-red-300">{erro}</p>}
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={() => setCriando(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className="flex-1" disabled={busy}>
                  {busy ? 'Criando…' : 'Criar grupo'}
                </Button>
              </div>
              <p className="text-[11px] leading-relaxed text-ink-500">
                Cada grupo tem os seus atletas, jogos, financeiro e plano. Nada deste grupo aparece nos outros.
              </p>
            </form>
          ) : (
            <button
              onClick={() => setCriando(true)}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-ink-700 py-3 text-sm font-medium text-ink-300"
            >
              <Plus size={16} />
              Criar novo grupo
            </button>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {MODES.map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.id}
                  onClick={() => comecar(m.id)}
                  className="rounded-3xl border border-ink-800 bg-ink-900 p-5 text-left transition-colors active:scale-[0.99] active:bg-ink-800"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-300">
                      <Icon size={22} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-lg font-bold text-ink-50">{m.title}</span>
                      <span className="block text-xs text-ink-400">{m.tagline}</span>
                    </span>
                    <span className="shrink-0 text-lg">{m.sports}</span>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-ink-400">{m.detail}</p>
                </button>
              );
            })}
          </div>
          <p className="mt-6 text-center text-xs leading-relaxed text-ink-600">
            Dá para trocar depois, pelo nome do grupo no alto da tela.
          </p>
        </>
      )}
    </div>
  );
}
