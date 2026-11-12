import { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/store/useAuth';
import {
  findActiveGroup,
  linkDoGrupoWhatsapp,
  normalizarLinkDoGrupo,
  salvarLinkDoGrupoWhatsapp,
  type CloudGroup,
} from '@/lib/cloud';
import { explain } from '@/components/cloud/partes';

/**
 * Ajustes › Grupo do WhatsApp (migração 043, pedido do Guilherme em
 * 12/11/2026). Com o link de convite do grupo salvo, "Mandar a lista no
 * grupo" copia a lista e abre o grupo direto — no app do admin e no link do
 * atleta. Nada é postado sozinho: a pessoa cola e envia.
 */
export function LinkDoGrupoWhatsapp() {
  const ready = useAuth((s) => s.ready);
  const session = useAuth((s) => s.session);
  const [group, setGroup] = useState<CloudGroup | null>(null);
  const [salvo, setSalvo] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [editando, setEditando] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !session) return;
    let vivo = true;
    findActiveGroup()
      .then(async (g) => {
        if (!vivo || !g) return;
        setGroup(g);
        const l = await linkDoGrupoWhatsapp(g.id);
        if (vivo) setSalvo(l);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [ready, session]);

  if (!ready || !session || !group) return null;

  async function gravar(link: string | null) {
    if (!group) return;
    setBusy(true);
    setErro(null);
    try {
      await salvarLinkDoGrupoWhatsapp(group.id, link);
      setSalvo(link);
      setEditando(false);
    } catch (e) {
      setErro(e instanceof Error && !('code' in e) ? e.message : explain(e));
    }
    setBusy(false);
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    const link = normalizarLinkDoGrupo(texto);
    if (!link) {
      setErro('Cole o link de convite do grupo, que começa com https://chat.whatsapp.com/');
      return;
    }
    void gravar(link);
  }

  return (
    <section className="mt-3 rounded-2xl border border-ink-800 bg-ink-900 p-4">
      <p className="flex items-center gap-2 text-[15px] font-semibold text-ink-50">
        <MessageCircle size={17} className="text-brand-400" />
        Grupo do WhatsApp
      </p>
      <p className="mt-1 text-xs leading-relaxed text-ink-400">
        Com o link do grupo, "Mandar a lista no grupo" já abre o grupo da pelada com a lista copiada: é só colar e
        enviar. E o convidado que se inscreve pelo link de convidados ganha o botão "Acesso ao grupo". No WhatsApp: dados
        do grupo › Convidar via link › Copiar link.
      </p>
      {editando ? (
        <form onSubmit={salvar} className="mt-3">
          <input
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            inputMode="url"
            placeholder="https://chat.whatsapp.com/..."
            aria-label="Link do grupo do WhatsApp"
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
            <Button type="submit" className="flex-1" disabled={busy || texto.trim().length < 10}>
              Salvar
            </Button>
          </div>
        </form>
      ) : (
        <>
          <p className="mt-3 truncate text-sm text-ink-200">{salvo ?? 'Nenhum link salvo'}</p>
          {erro && <p className="mt-2 text-sm text-red-300">{erro}</p>}
          <div className="mt-3 flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => {
                setTexto(salvo ?? '');
                setEditando(true);
              }}
            >
              {salvo ? 'Trocar link' : 'Colar link do grupo'}
            </Button>
            {salvo && (
              <Button variant="secondary" disabled={busy} onClick={() => void gravar(null)}>
                Tirar
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
