import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, UserMinus, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/store/useAuth';
import {
  adminLink,
  administradores,
  cancelarConviteAdmin,
  convitesAdminAbertos,
  criarConviteAdmin,
  findMyGroup,
  removerAdmin,
  shareOnWhatsApp,
  type Administrador,
  type CloudGroup,
  type ConviteAdmin,
} from '@/lib/cloud';
import { explain, ShareRow } from '@/components/cloud/partes';

const validoAte = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * Ajustes › Administradores (migração 012). O dono convida por link — uso
 * único, 48 h — e remove; o administrador convidado vê a lista e pode sair.
 * Carregado sob demanda: traz o Supabase.
 */
export function Administradores() {
  const ready = useAuth((s) => s.ready);
  const session = useAuth((s) => s.session);
  const [group, setGroup] = useState<CloudGroup | null | undefined>(undefined);
  const [admins, setAdmins] = useState<Administrador[]>([]);
  const [convites, setConvites] = useState<ConviteAdmin[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const souDono = admins.some((a) => a.souEu && a.role === 'dono');

  const carregar = useCallback(async (g: CloudGroup) => {
    const lista = await administradores(g.id);
    setAdmins(lista);
    if (lista.some((a) => a.souEu && a.role === 'dono')) setConvites(await convitesAdminAbertos(g.id));
  }, []);

  useEffect(() => {
    if (!ready || !session) return;
    let alive = true;
    (async () => {
      try {
        const g = await findMyGroup('amador');
        if (!alive) return;
        setGroup(g);
        if (g) await carregar(g);
      } catch (e) {
        if (alive) setError(explain(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [ready, session, carregar]);

  async function convidar() {
    if (!group) return;
    setBusy(true);
    setError(null);
    try {
      const novo = await criarConviteAdmin(group.id);
      setConvites((c) => [novo, ...c]);
    } catch (e) {
      setError(explain(e));
    }
    setBusy(false);
  }

  async function cancelar(token: string) {
    if (!window.confirm('Cancelar este convite? O link deixa de funcionar.')) return;
    try {
      await cancelarConviteAdmin(token);
      setConvites((c) => c.filter((x) => x.token !== token));
    } catch (e) {
      setError(explain(e));
    }
  }

  async function remover(a: Administrador) {
    if (!group) return;
    const pergunta = a.souEu
      ? 'Sair da administração deste grupo? Os dados continuam neste aparelho, mas você deixa de mexer no grupo.'
      : `Remover ${a.name} dos administradores?`;
    if (!window.confirm(pergunta)) return;
    try {
      await removerAdmin(group.id, a.userId);
      await carregar(group);
    } catch (e) {
      setError(explain(e));
    }
  }

  if (!ready) return null;
  if (!session) return null;

  return (
    <section className="mt-3 rounded-2xl border border-ink-800 bg-ink-900 p-4">
      <p className="flex items-center gap-2 text-[15px] font-semibold text-ink-50">
        <ShieldCheck size={17} className="text-brand-400" />
        Administradores
      </p>
      {error && <p className="mt-2 text-sm text-red-300">{error}</p>}

      {group === undefined ? (
        <p className="mt-2 text-sm text-ink-500">Carregando…</p>
      ) : !group ? (
        <p className="mt-2 text-sm leading-relaxed text-ink-400">
          Crie o grupo na aba Jogo para poder ter mais administradores.
        </p>
      ) : (
        <>
          <ul className="mt-3 flex flex-col gap-2">
            {admins.map((a) => (
              <li key={a.userId} className="flex items-center gap-3">
                {a.avatarUrl ? (
                  <img src={a.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-9 shrink-0 rounded-full" />
                ) : (
                  <span className="size-9 shrink-0 rounded-full bg-ink-800" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink-50">
                    {a.name}
                    {a.souEu && <span className="font-normal text-ink-500"> · você</span>}
                  </span>
                  <span className="block text-xs text-ink-500">
                    {a.role === 'dono' ? 'Dono do grupo' : 'Administrador'}
                  </span>
                </span>
                {a.role !== 'dono' && (souDono || a.souEu) && (
                  <button
                    onClick={() => remover(a)}
                    className="flex shrink-0 items-center gap-1 rounded-lg border border-ink-800 px-2.5 py-1.5 text-xs text-ink-400"
                  >
                    <UserMinus size={13} />
                    {a.souEu ? 'Sair' : 'Remover'}
                  </button>
                )}
              </li>
            ))}
          </ul>

          {souDono ? (
            <>
              {convites.map((c) => (
                <div key={c.token} className="mt-3 rounded-xl border border-ink-800 bg-ink-950 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-ink-400">
                      Convite de uso único · vale até {validoAte(c.expiresAt)}
                    </p>
                    <button
                      onClick={() => cancelar(c.token)}
                      className="shrink-0 p-1 text-ink-500"
                      aria-label="Cancelar convite"
                    >
                      <X size={15} />
                    </button>
                  </div>
                  <ShareRow
                    label="Enviar no WhatsApp"
                    link={adminLink(c.token)}
                    onShare={() =>
                      shareOnWhatsApp(
                        `🛡️ Convite para administrar ${group.name} no TimeCerto\n\nToque no link, entre com sua conta Google e aceite. O link vale para uma pessoa e por 48 horas.\n${adminLink(c.token)}`,
                      )
                    }
                  />
                </div>
              ))}
              <Button variant="secondary" className="mt-3 w-full" disabled={busy} onClick={convidar}>
                {busy ? 'Gerando…' : 'Convidar administrador'}
              </Button>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
                O administrador cuida dos atletas, do jogo, dos convites e do sorteio.
                Convidar e remover administradores fica só com você. Cada link vale para uma
                pessoa e por 48 horas.
              </p>
            </>
          ) : (
            <p className="mt-3 text-[11px] leading-relaxed text-ink-500">
              Convidar e remover administradores fica com o dono do grupo.
            </p>
          )}
        </>
      )}
    </section>
  );
}
