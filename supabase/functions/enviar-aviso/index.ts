// Edge Function do Supabase (Deno) — o carteiro dos avisos no celular
// (migração 016). Um Database Webhook chama esta função a cada linha nova em
// `avisos`; ela entrega aos celulares inscritos e marca o aviso como enviado.
//
// Segredos (Edge Functions › Secrets, NUNCA no app nem no git):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY — par gerado por `npx web-push generate-vapid-keys`
//   VAPID_SUBJECT                        — mailto: de contato, exigido pelos serviços de push
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY o próprio Supabase fornece.
//
// Segurança: a função só entrega aviso que está na caixa e ainda não saiu, e
// marca "saiu" ANTES de entregar — chamá-la de fora, ou duas vezes, não
// inventa nem repete aviso. Endereço de entrega fora dos serviços de push é
// apagado sem receber nada (o banco já recusa na entrada; aqui é a segunda
// trava).

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:contato@timecerto.app',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
);

const SERVICOS_DE_PUSH =
  /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)\//;

Deno.serve(async (req) => {
  const body = await req.json().catch(() => null);
  const id = body?.record?.id;
  if (!id) return new Response('aviso sem id', { status: 400 });

  // Pega o aviso e marca como saído numa operação só: se dois chamados
  // chegarem juntos, só um encontra enviado_em vazio
  const { data: aviso, error } = await supabase
    .from('avisos')
    .update({ enviado_em: new Date().toISOString() })
    .eq('id', id)
    .is('enviado_em', null)
    .select('id, group_id, destino, player_id, tipo, titulo, corpo, url')
    .maybeSingle();
  if (error) {
    console.error('ler aviso', error);
    return new Response('erro ao ler o aviso', { status: 500 });
  }
  if (!aviso) return new Response('já enviado', { status: 200 });

  let busca = supabase.from('push_inscricoes').select('id, endpoint, p256dh, auth').eq('group_id', aviso.group_id);
  busca = aviso.destino === 'admins' ? busca.not('user_id', 'is', null) : busca.eq('player_id', aviso.player_id);
  const { data: inscricoes, error: e2 } = await busca;
  if (e2) {
    console.error('ler inscrições', e2);
    return new Response('erro ao ler as inscrições', { status: 500 });
  }

  const conteudo = JSON.stringify({ titulo: aviso.titulo, corpo: aviso.corpo, url: aviso.url, tag: aviso.tipo });
  let entregues = 0;
  let falhas = 0;
  for (const s of inscricoes ?? []) {
    if (!SERVICOS_DE_PUSH.test(s.endpoint)) {
      await supabase.from('push_inscricoes').delete().eq('id', s.id);
      continue;
    }
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        conteudo,
        // Aviso de vaga velho não serve: some depois de 6 h sem entregar
        { TTL: 6 * 3600, urgency: aviso.tipo === 'vaga' ? 'high' : 'normal' },
      );
      entregues++;
    } catch (e) {
      falhas++;
      const status = (e as { statusCode?: number }).statusCode;
      // 404/410: o celular desinstalou ou tirou a permissão — a inscrição morreu
      if (status === 404 || status === 410) {
        await supabase.from('push_inscricoes').delete().eq('id', s.id);
      } else {
        console.error('entregar aviso', status, (e as Error).message);
      }
    }
  }

  await supabase.from('avisos').update({ resultado: { entregues, falhas } }).eq('id', aviso.id);
  return new Response(JSON.stringify({ entregues, falhas }), {
    headers: { 'content-type': 'application/json' },
  });
});
