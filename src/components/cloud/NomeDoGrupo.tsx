import { useEffect, useState } from 'react';
import { Pencil, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/store/useAuth';
import { findMyGroup, renomearGrupo, type CloudGroup } from '@/lib/cloud';
import { explain } from '@/components/cloud/partes';

/**
 * Ajustes › Nome do grupo. É o nome que aparece no alto dos links do WhatsApp
 * e nos avisos no celular — mudar aqui muda lá na hora. Pedido do Guilherme
 * em 29/09/2026: o grupo nasceu "Pelada" e não havia onde trocar.
 */
export function NomeDoGrupo() {
  const ready = useAuth((s) => s.ready);
  const session = useAuth((s) => s.session);
  const [group, setGroup] = useState<CloudGroup | null | undefined>(undefined);
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    if (!ready || !session) return;
    let vivo = true;
    findMyGroup('amador')
      .then((g) => vivo && setGroup(g))
      .catch(() => vivo && setGroup(null));
    return () => {
      vivo = false;
    };
  }, [ready, session]);

  if (!ready || !session || !group) return null;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!group) return;
    setBusy(true);
    setErro(null);
    try {
      const novo = await renomearGrupo(group.id, nome);
      setGroup({ ...group, name: novo });
      setEditando(false);
      setSalvo(true);
    } catch (err) {
      setErro(err instanceof Error && !('code' in err) ? err.message : explain(err));
    }
    setBusy(false);
  }

  return (
    <section className="mt-3 rounded-2xl border border-ink-800 bg-ink-900 p-4">
      <p className="flex items-center gap-2 text-[15px] font-semibold text-ink-50">
        <Users size={17} className="text-brand-400" />
        Nome do grupo
      </p>
      {editando ? (
        <form onSubmit={salvar} className="mt-3">
          <input
            autoFocus
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={40}
            aria-label="Nome do grupo"
            className="w-full rounded-xl bg-ink-800 px-3 py-3 text-[15px] text-ink-50 outline-none"
          />
          {erro && <p className="mt-2 text-sm text-red-300">{erro}</p>}
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setEditando(false);
                setErro(null);
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={busy || nome.trim().length < 2}>
              {busy ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="mt-2 flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-lg font-semibold text-ink-50">{group.name}</span>
            <button
              onClick={() => {
                setNome(group.name);
                setSalvo(false);
                setEditando(true);
              }}
              className="flex shrink-0 items-center gap-1 rounded-lg border border-ink-800 px-2.5 py-1.5 text-xs text-ink-300"
            >
              <Pencil size={13} />
              Trocar
            </button>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-ink-500">
            {salvo
              ? 'Nome trocado. Os links do WhatsApp já mostram o nome novo.'
              : 'É o nome que aparece no alto dos links do WhatsApp e nos avisos no celular.'}
          </p>
        </>
      )}
    </section>
  );
}
