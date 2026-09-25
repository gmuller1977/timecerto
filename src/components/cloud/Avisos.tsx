import { useEffect, useState } from 'react';
import { Bell, BellOff, Share } from 'lucide-react';
import {
  ativarAvisos,
  avisosBloqueados,
  avisosConfigurados,
  avisosDisponiveis,
  desativarAvisos,
  inscricaoAtual,
  iphoneSemInstalar,
} from '@/lib/avisos';
import {
  cancelarAvisoAdmin,
  findMyGroup,
  guestCancelarAviso,
  guestInscreverAviso,
  inscreverAdmin,
} from '@/lib/cloud';
import { useAuth } from '@/store/useAuth';
import { cn } from '@/lib/utils';

/** Quem este aparelho avisa: por link, o atleta; `admin`, o grupo da conta */
const chaveLocal = (dono: string) => `timecerto:aviso:${dono}`;
function lerLocal(dono: string): string | null {
  try {
    return localStorage.getItem(chaveLocal(dono));
  } catch {
    return null;
  }
}
function gravarLocal(dono: string, valor: string | null) {
  try {
    if (valor) localStorage.setItem(chaveLocal(dono), valor);
    else localStorage.removeItem(chaveLocal(dono));
  } catch {
    /* navegação privada: só não lembra */
  }
}

type Estado = 'carregando' | 'ativo' | 'inativo';

/**
 * O interruptor dos avisos, igual para o atleta e para o administrador. Só
 * mostra "ativo" quando os dois lados concordam: o celular tem a inscrição E
 * ela foi registrada para esta pessoa (`dono`). Um celular emprestado, com
 * aviso ativado por outra pessoa, aparece como inativo.
 */
function useInterruptor(dono: string, quem: string | null) {
  const [estado, setEstado] = useState<Estado>('carregando');
  useEffect(() => {
    let vivo = true;
    inscricaoAtual()
      .then((s) => vivo && setEstado(s && quem && lerLocal(dono) === quem ? 'ativo' : 'inativo'))
      .catch(() => vivo && setEstado('inativo'));
    return () => {
      vivo = false;
    };
  }, [dono, quem]);
  return [estado, setEstado] as const;
}

function DicaIphone() {
  return (
    <p className="mt-3 flex items-start gap-2 rounded-xl border border-ink-800 bg-ink-900 px-3 py-2.5 text-xs leading-relaxed text-ink-400">
      <Share size={15} className="mt-0.5 shrink-0 text-ink-500" />
      <span>
        Para receber avisos no iPhone, toque em <strong className="text-ink-200">Compartilhar</strong> ›{' '}
        <strong className="text-ink-200">Adicionar à Tela de Início</strong> e abra o TimeCerto por lá.
      </span>
    </p>
  );
}

function Interruptor({
  estado,
  busy,
  erro,
  textoAtivar,
  explicacao,
  onAtivar,
  onDesativar,
}: {
  estado: Estado;
  busy: boolean;
  erro: string | null;
  textoAtivar: string;
  explicacao: string;
  onAtivar: () => void;
  onDesativar: () => void;
}) {
  if (estado === 'carregando') return null;
  return (
    <div className="mt-3">
      {estado === 'ativo' ? (
        <div className="flex items-center gap-2 rounded-xl border border-brand-500/30 bg-brand-500/10 px-3 py-2.5">
          <Bell size={16} className="shrink-0 text-brand-300" />
          <span className="min-w-0 flex-1 text-sm text-brand-100">Avisos ativados neste celular</span>
          <button
            disabled={busy}
            onClick={onDesativar}
            className="flex shrink-0 items-center gap-1 text-xs text-ink-400 underline"
          >
            <BellOff size={13} />
            Desativar
          </button>
        </div>
      ) : (
        <>
          <button
            disabled={busy}
            onClick={onAtivar}
            className={cn(
              'flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-brand-500/50 text-sm font-semibold text-brand-200 active:scale-[0.99] disabled:opacity-50',
            )}
          >
            <Bell size={17} />
            {busy ? 'Ativando…' : textoAtivar}
          </button>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-500">{explicacao}</p>
        </>
      )}
      {erro && <p className="mt-2 text-xs text-red-300">{erro}</p>}
    </div>
  );
}

/**
 * No link do grupo, depois que a pessoa diz quem é. Migração 016: ela passa a
 * receber vaga aberta, jogo novo, o time dela e os avisos do organizador.
 */
export function AvisoDoAtleta({ code, playerId }: { code: string; playerId: string }) {
  const dono = code.toUpperCase();
  const [estado, setEstado] = useInterruptor(dono, playerId);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (!avisosConfigurados()) return null;
  if (!avisosDisponiveis()) return iphoneSemInstalar() ? <DicaIphone /> : null;
  if (avisosBloqueados() && estado !== 'ativo') {
    return (
      <p className="mt-3 text-xs leading-relaxed text-ink-500">
        Os avisos deste site estão bloqueados no seu navegador. Para receber, libere as notificações nos
        ajustes do navegador.
      </p>
    );
  }

  async function ativar() {
    setBusy(true);
    setErro(null);
    try {
      const s = await ativarAvisos();
      await guestInscreverAviso(code, playerId, s);
      gravarLocal(dono, playerId);
      setEstado('ativo');
    } catch (e) {
      console.error('ativar avisos', e);
      setErro((e as Error).message || 'Não deu para ativar. Tente de novo.');
    }
    setBusy(false);
  }

  async function desativar() {
    setBusy(true);
    setErro(null);
    try {
      const endpoint = await desativarAvisos();
      if (endpoint) await guestCancelarAviso(code, endpoint);
      gravarLocal(dono, null);
      setEstado('inativo');
    } catch (e) {
      console.error('desativar avisos', e);
      setErro('Não deu para desativar. Confira a internet.');
    }
    setBusy(false);
  }

  return (
    <Interruptor
      estado={estado}
      busy={busy}
      erro={erro}
      textoAtivar="Me avise pelo celular"
      explicacao="Você recebe um aviso quando abrir vaga para você, quando o jogo for marcado e quando sair o seu time."
      onAtivar={ativar}
      onDesativar={desativar}
    />
  );
}

/**
 * Em Ajustes, para o administrador: alguém saiu, aceitou ou recusou a vaga,
 * e vaga aberta sem ninguém na espera.
 */
export function AvisosDoAdmin() {
  const ready = useAuth((s) => s.ready);
  const session = useAuth((s) => s.session);
  const [grupo, setGrupo] = useState<string | null | undefined>(undefined);
  const [estado, setEstado] = useInterruptor('admin', grupo ?? null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !session) return;
    let vivo = true;
    findMyGroup('amador')
      .then((g) => vivo && setGrupo(g?.id ?? null))
      .catch(() => vivo && setGrupo(null));
    return () => {
      vivo = false;
    };
  }, [ready, session]);

  if (!avisosConfigurados() || !ready || !session || !grupo) return null;

  async function ativar() {
    if (!grupo) return;
    setBusy(true);
    setErro(null);
    try {
      const s = await ativarAvisos();
      await inscreverAdmin(grupo, s);
      gravarLocal('admin', grupo);
      setEstado('ativo');
    } catch (e) {
      console.error('ativar avisos do administrador', e);
      setErro((e as Error).message || 'Não deu para ativar. Tente de novo.');
    }
    setBusy(false);
  }

  async function desativar() {
    setBusy(true);
    setErro(null);
    try {
      const endpoint = await desativarAvisos();
      if (endpoint) await cancelarAvisoAdmin(endpoint);
      gravarLocal('admin', null);
      setEstado('inativo');
    } catch (e) {
      console.error('desativar avisos do administrador', e);
      setErro('Não deu para desativar. Confira a internet.');
    }
    setBusy(false);
  }

  return (
    <section className="mt-3 rounded-2xl border border-ink-800 bg-ink-900 p-4">
      <p className="flex items-center gap-2 text-[15px] font-semibold text-ink-50">
        <Bell size={17} className="text-brand-400" />
        Avisos no celular
      </p>
      {!avisosDisponiveis() ? (
        iphoneSemInstalar() ? (
          <DicaIphone />
        ) : (
          <p className="mt-2 text-sm text-ink-400">Este navegador não recebe avisos.</p>
        )
      ) : (
        <Interruptor
          estado={estado}
          busy={busy}
          erro={erro}
          textoAtivar="Ativar avisos neste celular"
          explicacao="Você fica sabendo quando alguém sai da lista fechada, quando o chamado da fila de espera aceita ou recusa, e quando sobra vaga sem ninguém esperando."
          onAtivar={ativar}
          onDesativar={desativar}
        />
      )}
    </section>
  );
}
