import { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useAuth } from '@/store/useAuth';
import { usePlano } from '@/store/usePlano';
import { useJogoStore } from '@/store/useJogoStore';
import { useMatchStore } from '@/store/useMatchStore';
import { anunciarJogo, copiaEDoGrupo, findMyGroup, gerarMensalidades, sincronizarDiarias, sincronizarJogos, sincronizarPartidas, syncAmador, syncPro } from '@/lib/cloud';
import { pendentesDeEnvio } from '@/lib/jogo';
import { lerGrupoAtivo } from '@/lib/grupoAtivo';
import { ativarGrupo, esquecerGrupo, lembrarNome } from '@/store/trocarGrupo';

const naoEnviado = (x: { remoteId?: string; enviadoEm?: string; updatedAt?: string }) =>
  !x.remoteId || x.enviadoEm !== x.updatedAt;

// O componente é montado uma vez só (App.tsx): o estado da rodada mora aqui.
let rodando = false;
let deNovo = false;

/*
 * O grupo que este aparelho sincronizou por último, GUARDADO no aparelho —
 * sobrevive a fechar o app. É o que permite perceber que o acesso acabou.
 *
 * Bug relatado pelo Guilherme em 29/09/2026: um administrador removido
 * continuava vendo jogos e atletas. O banco já recusava tudo a ele, mas o
 * app funciona sem internet e guarda uma cópia no aparelho — e a rodada
 * guardava o id do grupo na memória e nunca mais conferia se ainda podia.
 */
const MARCA = 'timecerto:grupo-nuvem';

function lerMarca(): string | null {
  try {
    return localStorage.getItem(MARCA);
  } catch {
    return null;
  }
}

function gravarMarca(id: string | null) {
  try {
    if (id) localStorage.setItem(MARCA, id);
    else localStorage.removeItem(MARCA);
  } catch {
    /* sem armazenamento: só não detecta a perda de acesso entre aberturas */
  }
}

/**
 * Perdeu o acesso ao grupo (foi removido de administrador, ou entrou outra
 * conta neste aparelho): apaga a cópia local da pelada — atletas, jogos,
 * sorteios e partidas do modo amador. O modo profissional é do aparelho e
 * não tem nada a ver com o grupo, então fica.
 */
function limparCopiaDoGrupo() {
  useAppStore.setState({ players: [], excluidos: [], lastResult: null, history: [], leituraNuvem: undefined });
  useJogoStore.setState({ jogos: [], leituraJogos: undefined });
  useMatchStore.setState((m) => ({
    matches: m.matches.filter((x) => x.mode === 'profissional'),
    excluidas: [],
    leituraPartidas: undefined,
    live: m.live && !m.live.pro ? null : m.live,
  }));
}

async function rodar(): Promise<void> {
  if (!navigator.onLine) return;
  // Uma rodada por vez; o que mudar durante ela dispara outra no fim
  if (rodando) {
    deNovo = true;
    return;
  }
  rodando = true;
  try {
    // Confere a CADA rodada: o acesso pode acabar a qualquer momento. Erro de
    // rede cai no catch lá embaixo, sem limpar nada — só a resposta do banco
    // dizendo "não é mais seu" limpa
    const meuId = useAuth.getState().session?.user.id ?? null;
    const ativo = lerGrupoAtivo();
    let grupo: string | null;
    if (ativo) {
      // Etapa 8: o grupo é o ATIVO, e findMyGroup devolve ele ou nada
      const g = await findMyGroup(ativo.mode);
      // O plano (migrações 021 e 022) vem junto: é daqui que as telas sabem o
      // que travar — na pelada e no time
      usePlano.getState().definir(g, meuId);
      if (!g) {
        console.warn('sem acesso ao grupo ativo: limpando a cópia dele deste aparelho');
        await esquecerGrupo(ativo.id);
        window.location.hash = '#/';
        return;
      }
      lembrarNome(g.id, g.name);
      // O time: o elenco sobe (e o que o atleta preencheu pelo link desce), e
      // a mensalidade do mês nasce — o Financeiro também é do profissional
      if (ativo.mode !== 'amador') {
        await syncPro(g.id);
        await gerarMensalidades(g.id).catch((e) => console.warn('gerar mensalidades', e));
        return;
      }
      grupo = g.id;
    } else {
      grupo = await grupoDoLegado(meuId);
    }
    if (grupo) {
      await syncAmador(grupo);
      await sincronizarJogos(grupo);
      await sincronizarPartidas(grupo);
      // O jogo que virou o próximo porque o anterior passou da janela de 12 h:
      // nada muda no banco nessa hora, então quem anuncia é esta rodada.
      // Falhar aqui não pode travar a sincronização
      await anunciarJogo(grupo).catch((e) => console.warn('anunciar o próximo jogo', e));
      // A mensalidade do mês nasce aqui, uma vez só (migração 017)
      await gerarMensalidades(grupo).catch((e) => console.warn('gerar mensalidades', e));
      await sincronizarDiarias(grupo).catch((e) => console.warn('sincronizar diárias', e));
    }
  } catch (e) {
    console.error('sincronizar com a nuvem', e);
  } finally {
    rodando = false;
    if (deNovo) {
      deNovo = false;
      void rodar();
    }
  }
}

/**
 * Aparelho de antes da etapa 8, ainda sem grupo ativo: acha o grupo amador da
 * conta, confere se a cópia do aparelho é dele — e, sendo, ADOTA: o grupo
 * vira o ativo e a cópia passa para a chave dele. Daí em diante a rodada é a
 * de cima.
 */
async function grupoDoLegado(meuId: string | null): Promise<string | null> {
  const achado = await findMyGroup('amador');
  usePlano.getState().definir(achado, meuId);
  const grupo = achado?.id ?? null;
  const anterior = lerMarca();
  // Sem marca — aparelho de antes desta correção —, a pista é a cópia já ter
  // passado pela nuvem (`enviadoEm`; o `remoteId` não serve, o jogo nasce
  // com ele) e a conta não ter grupo nenhum
  const veioDaNuvem =
    useAppStore.getState().players.some((x) => x.enviadoEm) || useJogoStore.getState().jogos.some((j) => j.enviadoEm);
  let perdeu = (anterior && anterior !== grupo) || (!anterior && !grupo && veioDaNuvem);
  // Sem marca e COM grupo: a conta pode ter um grupo próprio e o aparelho
  // guardar a cópia do grupo de onde ela foi removida (achado no teste do
  // Guilherme em 29/09/2026). Confere uma vez; depois a marca responde
  if (!perdeu && !anterior && grupo && veioDaNuvem) {
    const atletas = useAppStore
      .getState()
      .players.filter((x) => x.enviadoEm && x.remoteId)
      .map((x) => x.remoteId!);
    const jogos = useJogoStore
      .getState()
      .jogos.filter((j) => j.enviadoEm && j.remoteId)
      .map((j) => j.remoteId!);
    perdeu = !(await copiaEDoGrupo(grupo, atletas, jogos));
  }
  if (perdeu) {
    console.warn('sem acesso ao grupo sincronizado antes: limpando a cópia do aparelho');
    limparCopiaDoGrupo();
    gravarMarca(null);
  }
  if (grupo && achado) {
    gravarMarca(grupo);
    // Quem estava no profissional continua lá: adotar agora trocaria a tela
    // debaixo dele. A pelada segue sincronizando pela chave antiga
    if (useAppStore.getState().mode !== 'profissional') {
      await ativarGrupo({ id: grupo, mode: 'amador', name: achado.name });
    }
  }
  return grupo;
}

/**
 * Mantém atletas, jogos, sorteios, respostas e partidas iguais em todos os aparelhos da
 * conta (base única, fases 1 e 2). Não desenha nada. Carregado sob demanda em
 * App.tsx, só para quem tem sessão salva — quem nunca entrou não baixa o
 * Supabase.
 *
 * Roda ao abrir, ao voltar para o app, quando a internet volta, a cada 30 s
 * com a tela à vista, e 1,5 s depois de qualquer edição. Sem sinal, não tenta:
 * a edição fica guardada no aparelho e vai na próxima. Atletas antes dos
 * jogos — respostas e sorteio falam de jogadores pelo id da nuvem.
 */
export function SincronizacaoNuvem() {
  const ready = useAuth((s) => s.ready);
  const session = useAuth((s) => s.session);

  const ativo = ready && Boolean(session);

  useEffect(() => {
    if (!ativo) return;
    rodar();
    const aoVoltar = () => {
      if (!document.hidden) rodar();
    };
    const timer = setInterval(aoVoltar, 30_000);
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener('online', rodar);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', aoVoltar);
      window.removeEventListener('online', rodar);
    };
  }, [ativo]);

  // Edição local — atleta, jogo, sorteio ou resposta: envia logo depois, em lote
  useEffect(() => {
    if (!ativo) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const agendar = () => {
      clearTimeout(timer);
      timer = setTimeout(rodar, 1_500);
    };
    const offAtletas = useAppStore.subscribe((s, antes) => {
      if (s.players === antes.players && s.excluidos === antes.excluidos) return;
      if (s.excluidos.length > 0 || s.players.some(naoEnviado)) agendar();
    });
    const offJogos = useJogoStore.subscribe((s, antes) => {
      if (s.jogos === antes.jogos) return;
      if (s.jogos.some((j) => naoEnviado(j) || pendentesDeEnvio(j).length > 0)) agendar();
    });
    const offPartidas = useMatchStore.subscribe((s, antes) => {
      if (s.matches === antes.matches && s.excluidas === antes.excluidas) return;
      if (s.excluidas.length > 0 || s.matches.some((m) => m.mode !== 'profissional' && naoEnviado(m))) agendar();
    });
    return () => {
      offAtletas();
      offJogos();
      offPartidas();
      clearTimeout(timer);
    };
  }, [ativo]);

  return null;
}
