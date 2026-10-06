// Edge Function do Supabase (Deno) — recebe os avisos do Mercado Pago sobre as
// assinaturas (migração 038) e estende o plano do grupo a cada cobrança.
//
// Publicada SEM exigir login (--no-verify-jwt): quem chama é o Mercado Pago.
// Por isso ela não confia em nada do aviso além do id: busca a assinatura
// direto no Mercado Pago, com a nossa chave, e só então grava. Um aviso falso
// aponta para um id que não existe ou que não está pago — e nada acontece.
//
// Segredos: MP_ACCESS_TOKEN (o mesmo da função assinatura).
//
// Regras:
//   - assinatura AUTORIZADA: o plano vale até a próxima cobrança + 3 dias de
//     folga. Nunca encurta: se já valia mais, fica como estava;
//   - cancelada, pausada ou recusada: o plano não muda — vale até o fim do mês
//     já pago e depois deixa de ser estendido;
//   - VIP autorizado cancela um Pago que ainda esteja ativo no mesmo grupo
//     (o VIP inclui o Pago; ninguém paga os dois).

import { createClient } from 'npm:@supabase/supabase-js@2';

const MP = 'https://api.mercadopago.com';
const FOLGA_MS = 3 * 86_400_000;
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
  if (!r.ok) throw new Error(`Mercado Pago ${caminho}: ${r.status} ${JSON.stringify(corpo)}`);
  return corpo;
}

/** Relê a assinatura no Mercado Pago e põe o grupo em dia com ela */
async function atualizar(preapprovalId: string) {
  const pa = await mp(`/preapproval/${preapprovalId}`);
  const [groupId, plano] = String(pa.external_reference ?? '').split(':');
  if (!groupId || (plano !== 'pago' && plano !== 'vip')) {
    console.warn('assinatura sem referência do TimeCerto', preapprovalId);
    return;
  }
  const proxima = pa.next_payment_date ? new Date(pa.next_payment_date) : null;

  await servico.from('assinaturas').upsert({
    mp_id: String(pa.id),
    group_id: groupId,
    plano,
    status: pa.status,
    valor_cents: Math.round(Number(pa.auto_recurring?.transaction_amount ?? 0) * 100),
    payer_email: pa.payer_email ?? null,
    proxima_cobranca: proxima?.toISOString() ?? null,
    atualizada_em: new Date().toISOString(),
  });

  if (pa.status !== 'authorized' || !proxima) return;

  // Estende o plano até a próxima cobrança + folga — nunca encurta
  const coluna = plano === 'vip' ? 'vip_ate' : 'pago_ate';
  const { data: g } = await servico.from('groups').select(`id, ${coluna}`).eq('id', groupId).maybeSingle();
  if (!g) return;
  const atual = (g as Record<string, string | null>)[coluna];
  const novo = new Date(proxima.getTime() + FOLGA_MS);
  if (!atual || new Date(atual) < novo) {
    const { error } = await servico.from('groups').update({ [coluna]: novo.toISOString() }).eq('id', groupId);
    if (error) throw error;
  }

  // VIP ativo: o Pago do mesmo grupo não precisa mais ser cobrado
  if (plano === 'vip') {
    const { data: pagos } = await servico
      .from('assinaturas')
      .select('mp_id')
      .eq('group_id', groupId)
      .eq('plano', 'pago')
      .eq('status', 'authorized');
    for (const p of pagos ?? []) {
      await mp(`/preapproval/${p.mp_id}`, { method: 'PUT', body: JSON.stringify({ status: 'cancelled' }) });
      await servico.from('assinaturas').update({ status: 'cancelled' }).eq('mp_id', p.mp_id);
    }
  }
}

Deno.serve(async (req) => {
  // O Mercado Pago manda o tipo e o id no corpo (e, às vezes, na URL)
  const url = new URL(req.url);
  const body = await req.json().catch(() => null);
  const tipo = body?.type ?? body?.topic ?? url.searchParams.get('type') ?? url.searchParams.get('topic');
  const id = body?.data?.id ?? url.searchParams.get('data.id') ?? url.searchParams.get('id');
  if (!tipo || !id) return new Response('ok');

  try {
    if (tipo === 'subscription_preapproval' || tipo === 'preapproval') {
      await atualizar(String(id));
    } else if (tipo === 'subscription_authorized_payment' || tipo === 'authorized_payment') {
      // Uma cobrança do mês: a assinatura dela diz até quando vale
      const pagamento = await mp(`/authorized_payments/${id}`);
      if (pagamento?.preapproval_id) await atualizar(String(pagamento.preapproval_id));
    }
  } catch (e) {
    console.error('mp-webhook', tipo, id, (e as Error).message);
    // 500 faz o Mercado Pago tentar de novo mais tarde
    return new Response('erro', { status: 500 });
  }
  return new Response('ok');
});
