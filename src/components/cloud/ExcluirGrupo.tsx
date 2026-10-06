import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/store/useAuth';
import { esquecerGrupo } from '@/store/trocarGrupo';
import { excluirGrupo, findActiveGroup, meusGrupos, type CloudGroup } from '@/lib/cloud';
import { explain } from '@/components/cloud/partes';

const mesmoNome = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Ajustes › Excluir grupo (pedido do Guilherme, 30/09/2026). Só o dono vê.
 * Três travas, porque não há volta: abrir o cartão, digitar o nome do grupo,
 * e o banco (excluir_grupo, migração 025) conferir dono e nome de novo.
 *
 * Depois, o aparelho esquece o grupo (apaga a cópia dele) e volta à abertura,
 * que leva a outro grupo ou à lista.
 */
export function ExcluirGrupo() {
  const navigate = useNavigate();
  const ready = useAuth((s) => s.ready);
  const session = useAuth((s) => s.session);
  const [group, setGroup] = useState<CloudGroup | null>(null);
  const [aberto, setAberto] = useState(false);
  const [digitado, setDigitado] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !session) return;
    let vivo = true;
    findActiveGroup()
      .then((g) => vivo && setGroup(g))
      .catch(() => {
        /* sem rede: o cartão não aparece */
      });
    return () => {
      vivo = false;
    };
  }, [ready, session]);

  if (!ready || !session || !group || group.ownerId !== session.user.id) return null;

  async function excluir() {
    if (!group || !mesmoNome(digitado, group.name)) return;
    setBusy(true);
    setErro(null);
    try {
      await excluirGrupo(group.id, digitado);
      await esquecerGrupo(group.id);
      // Atualiza a lista guardada: o grupo some da troca de grupo
      await meusGrupos().catch(() => undefined);
      navigate('/', { replace: true });
    } catch (e) {
      setErro(e instanceof Error && !('code' in e) ? e.message : explain(e));
      setBusy(false);
    }
  }

  return (
    <section className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/5 p-4">
      <p className="flex items-center gap-2 text-[15px] font-semibold text-red-200">
        <Trash2 size={17} className="text-red-300" />
        Excluir grupo
      </p>
      {!aberto ? (
        <>
          <p className="mt-1 text-xs leading-relaxed text-ink-400">
            Apaga {group.name} para sempre, com tudo dele. Não tem volta.
          </p>
          <Button size="sm" variant="secondary" className="mt-3 w-full" onClick={() => setAberto(true)}>
            Quero excluir este grupo
          </Button>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm leading-relaxed text-red-100">
            Vai apagar <strong>para sempre</strong>: atletas, jogos, confirmações, partidas, cobranças,
            pagamentos e despesas de <strong>{group.name}</strong>. Os outros administradores e os atletas perdem o
            acesso na hora. Não tem volta.
          </p>
          <label className="mt-3 block">
            <span className="text-xs text-ink-300">
              Para confirmar, digite o nome do grupo: <strong className="text-ink-50">{group.name}</strong>
            </span>
            <input
              value={digitado}
              onChange={(e) => setDigitado(e.target.value)}
              autoComplete="off"
              aria-label="Nome do grupo, para confirmar"
              className="mt-1 w-full rounded-xl bg-ink-800 px-3 py-3 text-[15px] text-ink-50 outline-none"
            />
          </label>
          {erro && <p className="mt-2 text-sm text-red-300">{erro}</p>}
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setAberto(false);
                setDigitado('');
                setErro(null);
              }}
            >
              Cancelar
            </Button>
            <button
              disabled={busy || !mesmoNome(digitado, group.name)}
              onClick={excluir}
              className="flex-1 rounded-xl bg-red-600 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy ? 'Excluindo…' : 'Excluir para sempre'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
