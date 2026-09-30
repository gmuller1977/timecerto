import { useMemo, useState } from 'react';
import { useGrupoAtivo } from '@/store/useGrupoAtivo';
import { useAppStore } from '@/store/useAppStore';
import { camposDoPro, comoPro } from '@/lib/pro';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Link2, Radio, Send, UserPlus } from 'lucide-react';
import { avisoDeLimite } from '@/lib/plano';
import { usePremium } from '@/store/usePlano';
import { Button } from '@/components/ui/Button';
import { ProPlayerSheet } from '@/components/pro/ProPlayerSheet';
import { useMatchStore } from '@/store/useMatchStore';
import { AGE_GROUP_LABEL, NAIPE_LABEL, ageOn, bodyLine, linhaDePosicoes } from '@/lib/pro';
import type { ProPlayer } from '@/types';
import { initials } from '@/lib/utils';

export function ProPlayersPage() {
  const navigate = useNavigate();
  // Fase 2: o elenco mora no cadastro único; a tela continua vendo ProPlayer
  const cadastro = useAppStore((s) => s.players);
  const players = useMemo(() => cadastro.filter((p) => !p.pending).map(comoPro), [cadastro]);
  // Pedidos do link de cadastro (migração 027): aguardam o técnico aprovar
  const pendentes = useMemo(() => cadastro.filter((p) => p.pending), [cadastro]);
  const time = useGrupoAtivo();
  const addPlayerCompleto = useAppStore((s) => s.addPlayerCompleto);
  const updatePlayerUnico = useAppStore((s) => s.updatePlayer);
  const removePlayer = useAppStore((s) => s.removePlayer);
  const live = useMatchStore((s) => s.live);
  // Plano grátis: até 20 atletas no time (migração 022). O banco recusaria o
  // 21º e a sincronização do elenco travaria; a tela avisa antes
  const premium = usePremium();

  // O pedido vira atleta do elenco. No grátis, o limite de 20 vale aqui também
  function aprovar(id: string) {
    const aviso = avisoDeLimite(premium, players.length);
    if (aviso) return window.alert(aviso.replace('mensalistas', 'atletas').replace(' Convidados não contam.', ''));
    updatePlayerUnico(id, { pending: false });
  }
  function recusar(id: string, nome: string) {
    if (window.confirm(`Recusar o cadastro de ${nome}?`)) removePlayer(id);
  }

  // O link de cadastro do time (migração 027): o mesmo código da pelada
  const [enviandoLink, setEnviandoLink] = useState(false);
  async function enviarLinkDeCadastro() {
    setEnviandoLink(true);
    try {
      const { findActiveGroup, registerLink, shareOnWhatsApp } = await import('@/lib/cloud');
      const g = await findActiveGroup();
      if (!g?.registerCode) throw new Error('sem código');
      const link = registerLink(g.registerCode);
      shareOnWhatsApp(
        `📋 Cadastro de atleta — ${g.name}\n\nPreencha uma vez: nome, nascimento, telefone, altura, peso e posições. O técnico aprova e você entra no elenco.\n${link}`,
      );
    } catch (e) {
      console.error('link de cadastro do time', e);
      window.alert('Não deu para gerar o link agora. Confira a internet.');
    }
    setEnviandoLink(false);
  }

  // null = fechado · 'novo' = cadastro · atleta = edição
  const [editing, setEditing] = useState<ProPlayer | 'novo' | null>(null);

  const shown = players
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));


  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-32">
      <header className="safe-top flex items-start justify-between pt-6 pb-4">
        <div className="flex items-start gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Atletas</h1>
            {/* Em qual grupo se está (pedido do Guilherme, 30/09/2026) */}
            {time?.name && (
              <p className="mt-0.5 truncate text-sm font-semibold text-brand-300">
                {time.name}
                {time.ageGroup && time.naipe && (
                  <span className="font-normal text-ink-400">
                    {' '}
                    · {AGE_GROUP_LABEL[time.ageGroup]} {NAIPE_LABEL[time.naipe]}
                  </span>
                )}
              </p>
            )}
            <p className="mt-0.5 text-sm text-ink-400">
              🏐 {players.length} {players.length === 1 ? 'atleta' : 'atletas'}
            </p>
          </div>
        </div>
        {/* Os links pessoais (Convidar) saíram em 30/09/2026: o link de
            cadastro já pede tudo. Sem time na nuvem, o que resta é criá-lo */}
        {!time && (
          <div className="flex shrink-0 gap-1.5">
            <button
              onClick={() => navigate('/convites')}
              className="flex items-center gap-1.5 rounded-lg border border-brand-500/40 bg-brand-500/10 px-3 py-2 text-xs font-medium text-brand-300"
            >
              <Send size={14} />
              Criar o time
            </button>
          </div>
        )}
      </header>

      {pendentes.length > 0 && (
        <section className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3">
          <p className="mb-2 text-xs font-semibold tracking-wide text-amber-200 uppercase">
            Aguardando aprovação ({pendentes.length})
          </p>
          <div className="flex flex-col gap-2">
            {pendentes.map((p) => {
              const v = comoPro(p);
              return (
                <div key={p.id} className="rounded-xl border border-ink-800 bg-ink-950 px-3 py-2.5">
                  <p className="truncate text-[15px] font-semibold text-ink-50">{p.name}</p>
                  <p className="truncate text-xs text-ink-400">
                    {[
                      p.birthDate && ageOn(p.birthDate) !== null && `${ageOn(p.birthDate)} anos`,
                      v.position && linhaDePosicoes(v.position, v.outrasPosicoes),
                      bodyLine(v),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => recusar(p.id, p.name)}>
                      Recusar
                    </Button>
                    <Button size="sm" className="flex-1" onClick={() => aprovar(p.id)}>
                      Aprovar
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {live && (
        <button
          onClick={() => navigate('/placar')}
          className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-brand-500/40 bg-brand-500/10 px-4 py-3 text-left"
        >
          <Radio size={18} className="shrink-0 animate-pulse text-brand-400" />
          <span className="min-w-0 flex-1 text-[15px] font-semibold text-brand-200">
            Partida em andamento
          </span>
          <ChevronRight size={18} className="shrink-0 text-brand-400" />
        </button>
      )}

      <div className="mt-4 flex flex-col gap-2">
        {shown.map((p) => {
          const age = p.birthDate ? ageOn(p.birthDate) : null;
          const details = [
            p.position && linhaDePosicoes(p.position, p.outrasPosicoes),
            age !== null && `${age} anos`,
            bodyLine(p),
          ].filter(Boolean);
          return (
            <button
              key={p.id}
              onClick={() => setEditing(p)}
              className="flex w-full items-center gap-3 rounded-2xl border border-ink-800 bg-ink-900 px-3 py-3 text-left active:scale-[0.99]"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-sm font-bold text-brand-200">
                {initials(p.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium text-ink-50">
                  {p.name}
                </span>
                <span className="block truncate text-xs text-ink-400">
                  {details.join(' · ') || 'Sem detalhes — toque para completar'}
                </span>
              </span>
              <span className="shrink-0 text-right text-[11px] leading-tight text-ink-500">
                {AGE_GROUP_LABEL[p.ageGroup]}
                <br />
                {NAIPE_LABEL[p.naipe]}
              </span>
            </button>
          );
        })}
      </div>

      {players.length === 0 && (
        <div className="mt-10 text-center">
          <p className="text-5xl">📋</p>
          <p className="mt-3 text-sm leading-relaxed text-ink-400">
            Cadastre os atletas do seu time.
            <br />
            Com seis ou mais, dá para montar a escalação.
          </p>
        </div>
      )}

      {/* Acima da barra de abas; escalar e começar o jogo ficam na aba Jogo */}
      <div className="safe-bottom above-tabbar fixed inset-x-0 border-t border-ink-800 bg-ink-950/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg gap-2">
          <Button variant="secondary" size="lg" disabled={enviandoLink} onClick={enviarLinkDeCadastro}>
            <Link2 size={18} />
            Link de cadastro
          </Button>
          <Button
            size="lg"
            className="flex-1"
            onClick={() => {
              const aviso = avisoDeLimite(premium, players.length);
              if (aviso) window.alert(aviso.replace('mensalistas', 'atletas').replace(' Convidados não contam.', ''));
              else setEditing('novo');
            }}
          >
            <UserPlus size={19} />
            Novo atleta
          </Button>
        </div>
      </div>

      {editing && (
        <ProPlayerSheet
          player={editing === 'novo' ? undefined : editing}
          doTime={time ? { ageGroup: time.ageGroup ?? null, naipe: time.naipe ?? null } : undefined}
          defaults={{
            // O filtro da tela manda; sem filtro, o padrão do time (migração 024)
            ageGroup: time?.ageGroup ?? null,
            naipe: time?.naipe ?? null,
          }}
          onClose={() => setEditing(null)}
          onSave={(draft) => {
            if (editing === 'novo') addPlayerCompleto({ name: draft.name, ...camposDoPro(draft) });
            else updatePlayerUnico(editing.id, camposDoPro(draft, cadastro.find((p) => p.id === editing.id)));
            setEditing(null);
          }}
          onDelete={
            editing === 'novo'
              ? undefined
              : () => {
                  removePlayer(editing.id);
                  setEditing(null);
                }
          }
        />
      )}
    </div>
  );
}
