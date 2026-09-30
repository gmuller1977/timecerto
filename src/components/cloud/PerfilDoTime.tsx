import { useEffect, useState } from 'react';
import { Tags } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { CategoriaENaipe } from '@/components/pro/CategoriaENaipe';
import { useAuth } from '@/store/useAuth';
import { useAppStore } from '@/store/useAppStore';
import { findActiveGroup, salvarPerfilDoTime, type CloudGroup } from '@/lib/cloud';
import { AGE_GROUP_LABEL, NAIPE_LABEL } from '@/lib/pro';
import { explain } from '@/components/cloud/partes';
import type { AgeGroup, Naipe } from '@/types';

/**
 * Ajustes › Categoria e naipe (só no time, migração 024). É o padrão de todo
 * atleta novo — pedido do Guilherme em 30/09/2026, para não repetir a cada
 * cadastro. Mudar aqui não mexe em quem já está no elenco.
 */
export function PerfilDoTime() {
  const ready = useAuth((s) => s.ready);
  const session = useAuth((s) => s.session);
  const pro = (useAppStore((s) => s.mode) ?? 'amador') === 'profissional';
  const [group, setGroup] = useState<CloudGroup | null>(null);
  const [perfil, setPerfil] = useState<{ ageGroup: AgeGroup | null; naipe: Naipe | null }>({
    ageGroup: null,
    naipe: null,
  });
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    if (!ready || !session || !pro) return;
    let vivo = true;
    findActiveGroup()
      .then((g) => {
        if (!vivo || !g) return;
        setGroup(g);
        setPerfil({ ageGroup: g.ageGroup, naipe: g.naipe });
      })
      .catch(() => {
        /* sem rede: o cartão não aparece */
      });
    return () => {
      vivo = false;
    };
  }, [ready, session, pro]);

  if (!pro || !group) return null;
  const mudou = perfil.ageGroup !== group.ageGroup || perfil.naipe !== group.naipe;

  async function salvar() {
    if (!group) return;
    setBusy(true);
    setErro(null);
    try {
      await salvarPerfilDoTime(group.id, perfil);
      setGroup({ ...group, ...perfil });
      setSalvo(true);
    } catch (e) {
      setErro(e instanceof Error && !('code' in e) ? e.message : explain(e));
    }
    setBusy(false);
  }

  return (
    <section className="mt-3 rounded-2xl border border-ink-800 bg-ink-900 p-4">
      <p className="flex items-center gap-2 text-[15px] font-semibold text-ink-50">
        <Tags size={17} className="text-brand-400" />
        Categoria e naipe
      </p>
      <p className="mt-1 text-xs leading-relaxed text-ink-500">
        Todo atleta novo já nasce com eles. Quem já está no elenco não muda.
      </p>
      <div className="mt-3">
        <CategoriaENaipe
          ageGroup={perfil.ageGroup}
          naipe={perfil.naipe}
          onChange={(v) => {
            setPerfil((p) => ({ ...p, ...v }));
            setSalvo(false);
          }}
        />
      </div>
      {erro && <p className="mt-2 text-sm text-red-300">{erro}</p>}
      {mudou ? (
        <Button size="sm" className="mt-3 w-full" disabled={busy} onClick={salvar}>
          {busy ? 'Salvando…' : 'Salvar'}
        </Button>
      ) : (
        salvo &&
        group.ageGroup &&
        group.naipe && (
          <p className="mt-2 text-xs text-brand-300">
            Salvo: {AGE_GROUP_LABEL[group.ageGroup]} · {NAIPE_LABEL[group.naipe]}
          </p>
        )
      )}
    </section>
  );
}
