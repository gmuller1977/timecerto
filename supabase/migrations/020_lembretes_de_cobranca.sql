-- 020 · Histórico de cobranças enviadas
--
-- Pedido do Guilherme em 29/09/2026: "deveria ter um histórico de quem eu já
-- enviei a cobrança, para não ficar cobrando e fica chato".
--
-- Uma linha a cada vez que o administrador ABRE o WhatsApp com a cobrança —
-- o app não tem como saber se ele apertou Enviar. Fica na nuvem, e não no
-- aparelho, para que um administrador veja o que o outro já cobrou.
--
--   - canal 'individual': a mensagem para a pessoa (com o Pix);
--   - canal 'grupo': a pessoa estava na lista da mensagem do grupo.
--
-- Como o resto do financeiro: só quem administra lê e grava, e nada se edita
-- nem se apaga.

create table if not exists public.lembretes (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups on delete cascade,
  player_id   uuid not null references public.players,
  canal       text not null check (canal in ('individual', 'grupo')),
  -- Quanto a pessoa devia quando foi cobrada
  valor_cents int not null check (valor_cents > 0 and valor_cents <= 10000000),
  enviado_em  timestamptz not null default now(),
  enviado_por uuid references auth.users on delete set null default auth.uid()
);
create index if not exists lembretes_grupo_idx on public.lembretes (group_id, enviado_em);
alter table public.lembretes enable row level security;

drop policy if exists lembretes_ler on public.lembretes;
create policy lembretes_ler on public.lembretes
  for select using (public.can_manage_group(group_id));
drop policy if exists lembretes_registrar on public.lembretes;
create policy lembretes_registrar on public.lembretes
  for insert with check (
    public.can_manage_group(group_id)
    and exists (select 1 from public.players p where p.id = player_id and p.group_id = lembretes.group_id));
