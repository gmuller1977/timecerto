import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/store/useAuth';
import { useAppStore } from '@/store/useAppStore';
import {
  aceitarConviteAdmin,
  conviteAdminInfo,
  findMyGroup,
  syncAmador,
  type InfoConviteAdmin,
} from '@/lib/cloud';
import { Frame } from '@/pages/GuestGroupPage';

/** Mensagem do banco (em português) ou uma genérica de rede */
function dbMessage(err: unknown, fallback: string): string {
  const msg = (err as { message?: string })?.message;
  return msg && !/fetch|network/i.test(msg) ? msg : fallback;
}

/**
 * Link de convite de administrador (`/#/admin/TOKEN`, migração 012). O dono
 * gera em Ajustes › Administradores; quem recebe entra com o Google e vira
 * organizador do grupo. Uso único e vale 48 h.
 */
export function AdminInvitePage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const ready = useAuth((s) => s.ready);
  const session = useAuth((s) => s.session);
  const signInWithGoogle = useAuth((s) => s.signInWithGoogle);
  const setMode = useAppStore((s) => s.setMode);
  const [info, setInfo] = useState<InfoConviteAdmin | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [aceito, setAceito] = useState<{ group: string } | null>(null);

  useEffect(() => {
    if (!ready) return;
    conviteAdminInfo(token)
      .then(setInfo)
      .catch((e) => setError(dbMessage(e, 'Sem internet. Conecte e tente de novo.')));
  }, [ready, token, session]);

  async function entrar() {
    setBusy(true);
    const err = await signInWithGoogle(`/admin/${token}`);
    if (err) {
      setError(err);
      setBusy(false);
    }
  }

  async function aceitar() {
    setBusy(true);
    setError(null);
    try {
      const r = await aceitarConviteAdmin(token);
      setMode(r.mode);
      // Traz os atletas já: a sincronização automática procurou o grupo quando o
      // app abriu, antes do aceite, e só tentaria de novo na rodada seguinte
      if (r.mode === 'amador') {
        try {
          const g = await findMyGroup('amador');
          if (g) await syncAmador(g.id);
        } catch (e) {
          console.error('primeira sincronização do administrador', e);
        }
      }
      setAceito({ group: r.group });
    } catch (e) {
      setError(dbMessage(e, 'Não deu para aceitar. Confira a internet e tente de novo.'));
    }
    setBusy(false);
  }

  if (!ready) return null;

  let corpo: React.ReactNode;
  if (error && !info) {
    corpo = <p className="text-sm leading-relaxed text-ink-400">{error}</p>;
  } else if (!info) {
    corpo = <p className="text-sm text-ink-500">Carregando…</p>;
  } else if (aceito || info.usadoPorMim) {
    corpo = (
      <>
        <p className="text-[15px] leading-relaxed text-ink-200">
          Pronto: você é administrador de{' '}
          <span className="font-semibold text-ink-50">{aceito?.group ?? info.group}</span>.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink-400">
          Os atletas do grupo aparecem neste aparelho em alguns segundos. Você cuida do
          jogo, dos convites e do sorteio; convidar e remover administradores fica com o
          dono.
        </p>
        <Button size="lg" className="mt-5 w-full" onClick={() => navigate('/amador')}>
          Abrir o grupo
        </Button>
      </>
    );
  } else if (info.usado) {
    corpo = (
      <p className="text-sm leading-relaxed text-ink-400">
        Este convite já foi usado. Cada convite vale para uma pessoa — peça outro ao dono
        de <span className="text-ink-200">{info.group}</span>.
      </p>
    );
  } else if (info.expirado) {
    corpo = (
      <p className="text-sm leading-relaxed text-ink-400">
        Este convite expirou (vale 48 horas). Peça outro ao dono de{' '}
        <span className="text-ink-200">{info.group}</span>.
      </p>
    );
  } else {
    corpo = (
      <>
        <p className="text-[15px] leading-relaxed text-ink-200">
          Você foi convidado para ser administrador de{' '}
          <span className="font-semibold text-ink-50">{info.group}</span>.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink-400">
          Administrador cuida dos atletas, do jogo da semana, dos convites e do sorteio.
        </p>
        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
        {session ? (
          <Button size="lg" className="mt-5 w-full" disabled={busy} onClick={aceitar}>
            <ShieldCheck size={19} />
            {busy ? 'Entrando…' : 'Aceitar e virar administrador'}
          </Button>
        ) : (
          <>
            <Button size="lg" className="mt-5 w-full" disabled={busy} onClick={entrar}>
              {busy ? 'Abrindo o Google…' : 'Entrar com Google para aceitar'}
            </Button>
            <p className="mt-2 text-center text-xs text-ink-500">
              Depois de entrar, você volta para esta tela.
            </p>
          </>
        )}
      </>
    );
  }

  return (
    <Frame>
      <p className="text-xs font-semibold tracking-wide text-brand-400 uppercase">
        Convite de administrador
      </p>
      <div className="mt-3 rounded-2xl border border-ink-800 bg-ink-900 p-5">{corpo}</div>
    </Frame>
  );
}
