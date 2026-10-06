// Edge Function do Supabase (Deno) — inicia e cancela a assinatura do plano
// pelo Mercado Pago (migração 038). Quem chama é o app, com o login do dono do
// grupo; o Mercado Pago devolve a página de pagamento (init_point).
//
// Segredos (Edge Functions › Secrets, NUNCA no app nem no git):
//   MP_ACCESS_TOKEN — a chave da aplicação no Mercado Pago (TEST-... no teste)
//   APP_URL         — opcional; para onde o Mercado Pago volta depois de pagar
// SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY o Supabase fornece.
//
// Segurança: só o DONO do grupo assina ou cancela. A função não libera plano
// nenhum — quem libera é o mp-webhook, depois de confirmar no Mercado Pago.

import { createClient } from 'npm:@supabase/supabase-js@2';

const MP = 'https://api.mercadopago.com';
const PRECO_CENTS = { pago: 1490, vip: 2490 } as const;
type Plano = keyof typeof PRECO_CENTS;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'content-type': 'application/json' } });
const erro = (mensagem: string, status = 400) => resposta({ erro: mensagem }, status);

const servico = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

async function mp(caminho: string, init: RequestInit = {}) {
  const r = await fetch(`${MP}${caminho}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${Deno.env.get('MP_ACCESS_TOKEN')}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const corpo = await r.json().catch(() => null);
  if (!r.ok) {
    console.error('mercado pago', caminho, r.status, JSON.stringify(corpo));
    throw new Error(corpo?.message ?? `Mercado Pago respondeu ${r.status}`);
  }
  return corpo;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!Deno.env.get('MP_ACCESS_TOKEN')) return erro('A assinatura ainda não está configurada.', 503);

  // Quem está chamando: o login do app
  const auth = req.headers.get('Authorization') ?? '';
  const comoUsuario = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: u } = await comoUsuario.auth.getUser();
  if (!u?.user) return erro('Entre com a sua conta para assinar.', 401);

  const body = await req.json().catch(() => null);
  const acao = body?.acao as 'assinar' | 'cancelar' | undefined;
  const groupId = body?.group_id as string | undefined;
  if (!groupId || (acao !== 'assinar' && acao !== 'cancelar')) return erro('Pedido inválido.');

  const { data: g } = await servico.from('groups').select('id, name, mode, owner_id').eq('id', groupId).maybeSingle();
  if (!g) return erro('Grupo não encontrado.', 404);
  if (g.owner_id !== u.user.id) return erro('Quem assina é o dono do grupo.', 403);

  try {
    if (acao === 'cancelar') {
      const { data: ativas } = await servico
        .from('assinaturas')
        .select('mp_id')
        .eq('group_id', groupId)
        .in('status', ['authorized', 'pending', 'paused']);
      for (const a of ativas ?? []) {
        await mp(`/preapproval/${a.mp_id}`, { method: 'PUT', body: JSON.stringify({ status: 'cancelled' }) });
        await servico
          .from('assinaturas')
          .update({ status: 'cancelled', atualizada_em: new Date().toISOString() })
          .eq('mp_id', a.mp_id);
      }
      return resposta({ canceladas: (ativas ?? []).length });
    }

    // ── Assinar ──
    const plano = body?.plano as Plano;
    if (plano !== 'pago' && plano !== 'vip') return erro('Plano inválido.');
    // O Pago não libera o time profissional: lá só o VIP serve (migração 037)
    if (plano === 'pago' && g.mode === 'profissional') return erro('No time profissional, o plano é o VIP.');
    const email = String(body?.email ?? '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return erro('Informe o e-mail da sua conta do Mercado Pago.');

    const { data: jaTem } = await servico
      .from('assinaturas')
      .select('mp_id')
      .eq('group_id', groupId)
      .eq('plano', plano)
      .eq('status', 'authorized')
      .limit(1);
    if (jaTem?.length) return erro('Este grupo já tem essa assinatura ativa.');

    const app = Deno.env.get('APP_URL') ?? 'https://timecerto-theta.vercel.app';
    const valor = PRECO_CENTS[plano] / 100;
    const pa = await mp('/preapproval', {
      method: 'POST',
      body: JSON.stringify({
        reason: `TimeCerto ${plano === 'vip' ? 'VIP' : 'Pago'} · ${g.name}`.slice(0, 90),
        external_reference: `${groupId}:${plano}`,
        payer_email: email,
        back_url: `${app}/#/ajustes/plano`,
        status: 'pending',
        auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: valor, currency_id: 'BRL' },
      }),
    });

    await servico.from('assinaturas').upsert({
      mp_id: String(pa.id),
      group_id: groupId,
      plano,
      status: pa.status ?? 'pending',
      valor_cents: PRECO_CENTS[plano],
      payer_email: email,
      init_point: pa.init_point ?? null,
      criada_por: u.user.id,
      atualizada_em: new Date().toISOString(),
    });
    return resposta({ init_point: pa.init_point });
  } catch (e) {
    return erro((e as Error).message || 'Não deu para falar com o Mercado Pago.', 502);
  }
});
