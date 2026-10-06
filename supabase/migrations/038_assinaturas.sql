-- 038 · Assinaturas pelo Mercado Pago
--
-- Começado com o Guilherme em 06/10/2026. O dono do grupo assina o Pago ou o
-- VIP; o Mercado Pago cobra todo mês no cartão; cada cobrança aprovada estende
-- o plano do grupo (groups.pago_ate / vip_ate) até a próxima, com 3 dias de
-- folga. Quem grava é a Edge Function mp-webhook, com a chave de serviço — o
-- proteger_plano (021/037) continua barrando o app.
--
-- Cada linha é uma assinatura (um "preapproval" do Mercado Pago). Cancelada
-- ou com o cartão recusado, o plano vale até o fim do mês já pago: nada é
-- encurtado, só deixa de ser estendido.
--
-- Rodar uma vez no SQL Editor, DEPOIS da 037. Não apaga dados: cria uma
-- tabela.

create table if not exists public.assinaturas (
  -- O id do preapproval no Mercado Pago
  mp_id            text primary key,
  group_id         uuid not null references public.groups on delete cascade,
  plano            text not null check (plano in ('pago', 'vip')),
  -- pending, authorized, paused, cancelled — como o Mercado Pago diz
  status           text not null,
  valor_cents      int not null,
  payer_email      text,
  -- A página de pagamento, para continuar uma assinatura que ficou pendente
  init_point       text,
  proxima_cobranca timestamptz,
  criada_por       uuid references auth.users on delete set null,
  criada_em        timestamptz not null default now(),
  atualizada_em    timestamptz not null default now()
);
create index if not exists assinaturas_grupo_idx on public.assinaturas (group_id, criada_em desc);
alter table public.assinaturas enable row level security;

-- Ler: quem administra o grupo. Gravar: só as Edge Functions (chave de serviço)
drop policy if exists assinaturas_ler on public.assinaturas;
create policy assinaturas_ler on public.assinaturas
  for select using (public.can_manage_group(group_id));
