import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/store/useAuth';
import {
  createGroup,
  findMyGroup,
  guestLink,
  registerLink,
  shareOnWhatsApp,
  syncAmador,
  type CloudGroup,
} from '@/lib/cloud';
import { explain, ShareRow } from '@/components/cloud/partes';

/**
 * O "Convidar" de Atletas: traz gente nova para o grupo. É uma ação, não uma
 * tela (docs/telas-amador.md).
 *
 * Duas portas (pedido do Guilherme, 29/09/2026): o MENSALISTA recebe o link
 * de cadastro, que fica pendente até a aprovação; o CONVIDADO recebe o link
 * da lista de convidados — ele não se cadastra antes, entra direto no jogo
 * aberto, atrás dos mensalistas. Os convites do jogo da semana continuam no
 * cartão da aba Jogo.
 *
 * Carregada sob demanda no primeiro toque: é ela que traz o Supabase.
 */
export function ConvidarSheet({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const ready = useAuth((s) => s.ready);
  const session = useAuth((s) => s.session);
  const [group, setGroup] = useState<CloudGroup | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('Pelada');
  const [busy, setBusy] = useState(false);
  const [quem, setQuem] = useState<'mensalista' | 'convidado'>('mensalista');

  useEffect(() => {
    if (!session) return;
    let alive = true;
    findMyGroup('amador')
      .then((g) => alive && setGroup(g))
      .catch((e) => {
        if (!alive) return;
        setError(explain(e));
        setGroup(null);
      });
    return () => {
      alive = false;
    };
  }, [session]);

  async function handleCreate() {
    setBusy(true);
    setError(null);
    try {
      const g = await createGroup('amador', name || 'Meu grupo');
      await syncAmador(g.id);
      setGroup(g);
    } catch (e) {
      setError(explain(e));
    }
    setBusy(false);
  }

  let body: React.ReactNode = null;
  if (!ready) body = null;
  else if (!session) {
    body = (
      <>
        <p className="text-sm leading-relaxed text-ink-400">
          Só quem organiza precisa de conta. O grupo recebe um link e se cadastra sem
          criar nada.
        </p>
        <Button size="lg" className="mt-4 w-full" onClick={() => navigate('/entrar?volta=/elenco')}>
          Entrar com Google
        </Button>
      </>
    );
  } else if (group === undefined) {
    body = <p className="text-sm text-ink-500">Carregando…</p>;
  } else if (!group) {
    body = (
      <>
        <p className="text-sm leading-relaxed text-ink-400">
          Crie o grupo para ter os links. Os jogadores deste aparelho vão junto; nada sai
          do aparelho, a nuvem recebe uma cópia.
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Nome do grupo"
          className="mt-3 w-full rounded-xl bg-ink-800 px-3 py-3 text-[15px] text-ink-50 outline-none"
        />
        <Button size="lg" className="mt-3 w-full" disabled={busy} onClick={handleCreate}>
          {busy ? 'Criando…' : 'Criar grupo'}
        </Button>
      </>
    );
  } else {
    const escolha = (
      <div className="mb-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Quem você vai convidar">
        {(['mensalista', 'convidado'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={quem === k}
            onClick={() => setQuem(k)}
            className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${quem === k ? 'border-brand-500 bg-brand-500/10 text-brand-300' : 'border-ink-800 bg-ink-950 text-ink-300'}`}
          >
            {k === 'mensalista' ? 'Mensalista' : 'Convidado'}
          </button>
        ))}
      </div>
    );
    if (quem === 'convidado') {
      const link = group.guestCode ? guestLink(group.guestCode) : null;
      body = (
        <>
          {escolha}
          <p className="text-sm leading-relaxed text-ink-400">
            O convidado não precisa se cadastrar antes: pelo link ele coloca o nome na lista do jogo aberto.
            Mensalistas têm prioridade; se sobrar vaga, ele entra por ordem de chegada.
          </p>
          {link ? (
            <ShareRow
              label="Enviar link de convidado"
              link={link}
              onShare={() =>
                shareOnWhatsApp(
                  `⚡ ${group.name}

Quer jogar com a gente? Coloque seu nome na lista de convidados. Mensalistas têm prioridade; se sobrar vaga, entra por ordem de chegada.
${link}`,
                )
              }
            />
          ) : (
            <p className="mt-3 text-sm text-ink-400">O link de convidados ainda não existe para este grupo.</p>
          )}
        </>
      );
    } else if (!group.registerCode) {
      body = (
        <>
          {escolha}
          <p className="text-sm text-ink-400">
            O link de cadastro aparece depois da atualização do banco (migração 006).
          </p>
        </>
      );
    } else {
      const link = registerLink(group.registerCode);
      body = (
        <>
          {escolha}
          <p className="text-sm leading-relaxed text-ink-400">
            Cada um preenche nome, apelido, nascimento, telefone, posição e nível. O
            cadastro fica aguardando a sua aprovação no topo de Atletas.
          </p>
          <ShareRow
            label="Enviar link de cadastro"
            link={link}
            onShare={() =>
              shareOnWhatsApp(
                `📋 Cadastro de mensalistas — ${group.name}\n\nPreencha uma vez: nome, nascimento, telefone, posição e nível.\n${link}`,
              )
            }
          />
        </>
      );
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="safe-bottom relative rounded-t-3xl border-t border-ink-700 bg-ink-900 px-4 pt-4 pb-6">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink-700" />
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[17px] font-semibold text-ink-50">Convidar para o grupo</p>
          <button onClick={onClose} className="p-1 text-ink-500" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>
        {error && (
          <p className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300">
            {error}
          </p>
        )}
        {body}
      </div>
    </div>
  );
}
