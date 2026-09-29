-- ─────────────────────────────────────────────────────────────
-- 017 — Financeiro (fase 1)
--
-- Desenho aprovado pelo Guilherme em 29/09/2026:
--   - mensalista paga valor fixo por mês, com dia de vencimento; a cobrança
--     nasce sozinha no começo do mês (`gerar_mensalidades`);
--   - convidado paga diária pelo jogo em que entrou; a cobrança nasce ao
--     encerrar o jogo, com um toque do administrador (`lancar_diarias`);
--   - despesas (quadra, bola) só saem do caixa, ninguém é cobrado;
--   - a cobrança pelo WhatsApp leva o Pix copia e cola (gerado no app a
--     partir da chave Pix do grupo, sem integração com banco).
--
-- Regras de dinheiro:
--   - sempre em centavos inteiros;
--   - NADA se apaga: as tabelas não têm permissão de apagar nem de editar.
--     Pagamento e despesa errados ganham um ESTORNO (linha negativa
--     visível, `estorno_de`); cobrança indevida é CANCELADA, com quem e
--     quando. Com dinheiro de grupo, é isso que mantém a confiança.
--   - só o dono e os administradores leem e escrevem (`can_manage_group`);
--     os links dos atletas não veem nada daqui.
--
-- As tabelas antigas `payments` e `expenses`, nunca usadas, ficam paradas.
--
-- Rodar uma vez no SQL Editor, DEPOIS da 016. Não apaga dados: acrescenta
-- colunas em `groups` e cria três tabelas e sete funções.
-- ─────────────────────────────────────────────────────────────

-- ── Configuração do grupo ──
-- Os limites do Pix são os do padrão do Banco Central (BR Code): nome até
-- 25 letras, cidade até 15, chave até 77.
alter table public.groups
  add column if not exists mensalidade_cents int
    check (mensalidade_cents is null or mensalidade_cents between 1 and 10000000),
  add column if not exists mensalidade_dia smallint
    check (mensalidade_dia is null or mensalidade_dia between 1 and 28),
  add column if not exists diaria_cents int
    check (diaria_cents is null or diaria_cents between 1 and 10000000),
  add column if not exists pix_chave text check (pix_chave is null or length(pix_chave) <= 77),
  add column if not exists pix_nome text check (pix_nome is null or length(pix_nome) <= 25),
  add column if not exists pix_cidade text check (pix_cidade is null or length(pix_cidade) <= 15);

-- ── O que cada um deve ──
create table if not exists public.cobrancas (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups on delete cascade,
  -- Sem cascata: histórico de dinheiro não some junto com um cadastro
  player_id    uuid not null references public.players,
  tipo         text not null check (tipo in ('mensalidade', 'diaria', 'avulsa')),
  -- 'AAAA-MM' na mensalidade, o id do jogo na diária, um id novo na avulsa.
  -- É o que impede a mesma cobrança de nascer duas vezes
  referencia   text not null,
  descricao    text not null check (length(descricao) between 1 and 80),
  valor_cents  int not null check (valor_cents between 1 and 10000000),
  vence_em     date not null,
  event_id     uuid references public.events on delete set null,
  criada_em    timestamptz not null default now(),
  criada_por   uuid references auth.users on delete set null default auth.uid(),
  cancelada_em  timestamptz,
  cancelada_por uuid references auth.users on delete set null,
  unique (group_id, player_id, tipo, referencia)
);
create index if not exists cobrancas_grupo_idx on public.cobrancas (group_id, vence_em);
alter table public.cobrancas enable row level security;

-- ── O que entrou ──
-- Pagamento é do JOGADOR, não de uma cobrança: abate as dívidas mais antigas
-- primeiro (o app mostra assim). Estorno = linha negativa apontando a original.
create table if not exists public.pagamentos (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups on delete cascade,
  player_id   uuid not null references public.players,
  valor_cents int not null check (valor_cents <> 0 and abs(valor_cents) <= 10000000),
  metodo      text not null check (metodo in ('pix', 'dinheiro')),
  pago_em     date not null,
  obs         text check (obs is null or length(obs) <= 120),
  estorno_de  uuid references public.pagamentos on delete restrict,
  criado_em   timestamptz not null default now(),
  criado_por  uuid references auth.users on delete set null default auth.uid(),
  check ((valor_cents < 0) = (estorno_de is not null))
);
create index if not exists pagamentos_grupo_idx on public.pagamentos (group_id, pago_em);
create unique index if not exists pagamentos_um_estorno on public.pagamentos (estorno_de) where estorno_de is not null;
alter table public.pagamentos enable row level security;

-- ── O que saiu ──
create table if not exists public.despesas (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups on delete cascade,
  descricao   text not null check (length(descricao) between 1 and 80),
  valor_cents int not null check (valor_cents <> 0 and abs(valor_cents) <= 10000000),
  gasto_em    date not null,
  estorno_de  uuid references public.despesas on delete restrict,
  criado_em   timestamptz not null default now(),
  criado_por  uuid references auth.users on delete set null default auth.uid(),
  check ((valor_cents < 0) = (estorno_de is not null))
);
create index if not exists despesas_grupo_idx on public.despesas (group_id, gasto_em);
create unique index if not exists despesas_um_estorno on public.despesas (estorno_de) where estorno_de is not null;
alter table public.despesas enable row level security;

-- Ler: só quem administra o grupo. Gravar pagamento e despesa direto é
-- permitido, mas só POSITIVO e de jogador do próprio grupo; estorno e tudo de
-- cobrança passam pelas funções abaixo. Sem política de editar nem de apagar.
drop policy if exists cobrancas_ler on public.cobrancas;
create policy cobrancas_ler on public.cobrancas
  for select using (public.can_manage_group(group_id));

drop policy if exists pagamentos_ler on public.pagamentos;
create policy pagamentos_ler on public.pagamentos
  for select using (public.can_manage_group(group_id));
drop policy if exists pagamentos_lancar on public.pagamentos;
create policy pagamentos_lancar on public.pagamentos
  for insert with check (
    public.can_manage_group(group_id) and valor_cents > 0 and estorno_de is null
    and exists (select 1 from public.players p where p.id = player_id and p.group_id = pagamentos.group_id));

drop policy if exists despesas_ler on public.despesas;
create policy despesas_ler on public.despesas
  for select using (public.can_manage_group(group_id));
drop policy if exists despesas_lancar on public.despesas;
create policy despesas_lancar on public.despesas
  for insert with check (public.can_manage_group(group_id) and valor_cents > 0 and estorno_de is null);

-- ── Nomes dos meses, para a descrição da mensalidade ──
create or replace function public.nome_do_mes(p_mes int)
returns text language sql immutable set search_path = public as $$
  select (array['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
                'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'])[p_mes];
$$;

-- ── Mensalidade do mês corrente ──
-- Uma por mensalista ativo, uma vez só (a chave única segura dois
-- administradores abrindo o app juntos). Roda a cada sincronização do app do
-- administrador. Mês sem ninguém abrir o app não é gerado depois.
-- Devolve quantas cobranças nasceram agora.
create or replace function public.gerar_mensalidades(p_group uuid)
returns int language plpgsql security definer set search_path = public as $$
declare g public.groups; hoje date; ref text; vence date; n int;
begin
  if not public.can_manage_group(p_group) then
    raise exception 'Sem permissão neste grupo';
  end if;
  select * into g from public.groups where id = p_group;
  if g.mensalidade_cents is null or g.mensalidade_dia is null then
    return 0;
  end if;
  hoje := (now() at time zone 'America/Sao_Paulo')::date;
  ref := to_char(hoje, 'YYYY-MM');
  vence := make_date(extract(year from hoje)::int, extract(month from hoje)::int, g.mensalidade_dia);

  insert into public.cobrancas (group_id, player_id, tipo, referencia, descricao, valor_cents, vence_em)
  select p_group, p.id, 'mensalidade', ref,
         'Mensalidade de ' || public.nome_do_mes(extract(month from hoje)::int),
         g.mensalidade_cents, vence
    from public.players p
   where p.group_id = p_group and p.active and not p.pending and p.deleted_at is null
     and p.kind = 'mensalista'
  on conflict (group_id, player_id, tipo, referencia) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.gerar_mensalidades(uuid) from public, anon;
grant  execute on function public.gerar_mensalidades(uuid) to authenticated;

-- ── Diária dos convidados de um jogo ──
-- O administrador confirma quem jogou; o mesmo jogo não cobra duas vezes a
-- mesma pessoa. Devolve quantas cobranças nasceram agora.
create or replace function public.lancar_diarias(p_event uuid, p_players uuid[], p_valor_cents int)
returns int language plpgsql security definer set search_path = public as $$
declare ev public.events; dia date; n int;
begin
  select * into ev from public.events where id = p_event;
  if ev.id is null or not public.can_manage_group(ev.group_id) then
    raise exception 'Sem permissão neste grupo';
  end if;
  if p_valor_cents is null or p_valor_cents < 1 or p_valor_cents > 10000000 then
    raise exception 'Valor da diária inválido';
  end if;
  dia := (ev.starts_at at time zone 'America/Sao_Paulo')::date;

  insert into public.cobrancas (group_id, player_id, tipo, referencia, descricao, valor_cents, vence_em, event_id)
  select ev.group_id, p.id, 'diaria', ev.id::text,
         'Diária do jogo de ' || to_char(dia, 'DD/MM'), p_valor_cents, dia, ev.id
    from public.players p
   where p.id = any(p_players) and p.group_id = ev.group_id
  on conflict (group_id, player_id, tipo, referencia) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.lancar_diarias(uuid, uuid[], int) from public, anon;
grant  execute on function public.lancar_diarias(uuid, uuid[], int) to authenticated;

-- ── Cobrança avulsa (camisa, churrasco) ──
create or replace function public.lancar_avulsa(
  p_player uuid, p_descricao text, p_valor_cents int, p_vence_em date)
returns uuid language plpgsql security definer set search_path = public as $$
declare gid uuid; novo uuid;
begin
  select group_id into gid from public.players where id = p_player;
  if gid is null or not public.can_manage_group(gid) then
    raise exception 'Sem permissão neste grupo';
  end if;
  insert into public.cobrancas (group_id, player_id, tipo, referencia, descricao, valor_cents, vence_em)
  values (gid, p_player, 'avulsa', gen_random_uuid()::text, btrim(p_descricao), p_valor_cents,
          coalesce(p_vence_em, (now() at time zone 'America/Sao_Paulo')::date))
  returning id into novo;
  return novo;
end;
$$;
revoke execute on function public.lancar_avulsa(uuid, text, int, date) from public, anon;
grant  execute on function public.lancar_avulsa(uuid, text, int, date) to authenticated;

-- ── Cancelar cobrança: fica visível, com quem e quando ──
create or replace function public.cancelar_cobranca(p_cobranca uuid)
returns void language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  select group_id into gid from public.cobrancas where id = p_cobranca;
  if gid is null or not public.can_manage_group(gid) then
    raise exception 'Sem permissão neste grupo';
  end if;
  update public.cobrancas set cancelada_em = now(), cancelada_por = auth.uid()
   where id = p_cobranca and cancelada_em is null;
end;
$$;
revoke execute on function public.cancelar_cobranca(uuid) from public, anon;
grant  execute on function public.cancelar_cobranca(uuid) to authenticated;

-- ── Estornos: uma linha negativa, uma vez só ──
create or replace function public.estornar_pagamento(p_pagamento uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare o public.pagamentos; novo uuid;
begin
  select * into o from public.pagamentos where id = p_pagamento;
  if o.id is null or not public.can_manage_group(o.group_id) then
    raise exception 'Sem permissão neste grupo';
  end if;
  if o.valor_cents < 0 then
    raise exception 'Estorno não se estorna';
  end if;
  insert into public.pagamentos (group_id, player_id, valor_cents, metodo, pago_em, obs, estorno_de)
  values (o.group_id, o.player_id, -o.valor_cents, o.metodo,
          (now() at time zone 'America/Sao_Paulo')::date, 'Estorno', o.id)
  returning id into novo;
  return novo;
exception when unique_violation then
  raise exception 'Este pagamento já foi estornado';
end;
$$;
revoke execute on function public.estornar_pagamento(uuid) from public, anon;
grant  execute on function public.estornar_pagamento(uuid) to authenticated;

create or replace function public.estornar_despesa(p_despesa uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare o public.despesas; novo uuid;
begin
  select * into o from public.despesas where id = p_despesa;
  if o.id is null or not public.can_manage_group(o.group_id) then
    raise exception 'Sem permissão neste grupo';
  end if;
  if o.valor_cents < 0 then
    raise exception 'Estorno não se estorna';
  end if;
  insert into public.despesas (group_id, descricao, valor_cents, gasto_em, estorno_de)
  values (o.group_id, left('Estorno: ' || o.descricao, 80), -o.valor_cents,
          (now() at time zone 'America/Sao_Paulo')::date, o.id)
  returning id into novo;
  return novo;
exception when unique_violation then
  raise exception 'Esta despesa já foi estornada';
end;
$$;
revoke execute on function public.estornar_despesa(uuid) from public, anon;
grant  execute on function public.estornar_despesa(uuid) to authenticated;
