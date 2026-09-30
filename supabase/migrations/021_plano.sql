-- 021 · Plano grátis e plano pago (fase 1: o plano e as travas, sem cobrança)
--
-- Decidido pelo Guilherme em 29/09/2026:
--
--   - o plano é do GRUPO e quem paga é o organizador (R$ 14,90/mês, Mercado
--     Pago na fase 2);
--   - o pago libera o Financeiro, mais de um administrador e mais de 20
--     mensalistas (convidados não contam);
--   - todo grupo começa com 30 dias do pago; os que já existem ganham os 30
--     dias a partir desta migração; os do Guilherme ficam de cortesia;
--   - quando o plano acaba, NADA SE PERDE, SÓ TRAVA: o Financeiro fica só
--     para ler, o administrador extra vê mas não edita, e não entra o 21º
--     mensalista. Assinou de novo, volta tudo.
--
-- As travas moram no banco, e não só na tela: a tela esconde o botão, o banco
-- é quem garante.

-- ── O plano do grupo ──
alter table public.groups
  -- Fim do teste grátis. A coluna nova preenche os grupos que já existem com
  -- o mesmo "agora + 30 dias": o teste deles começa hoje
  add column if not exists teste_ate timestamptz default (now() + interval '30 days'),
  -- Pago até: quem preenche é o Mercado Pago, pela Edge Function (fase 2)
  add column if not exists pago_ate  timestamptz,
  -- Liberado para sempre, à mão, pelo SQL Editor
  add column if not exists cortesia  boolean not null default false;

-- O grupo não mexe no próprio plano. Quem entra pelo app (anon ou
-- authenticated) cria o grupo sempre com o teste padrão e nunca altera as três
-- colunas; o SQL Editor (postgres) e a Edge Function (service_role) podem.
create or replace function public.proteger_plano()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.teste_ate := now() + interval '30 days';
    new.pago_ate  := null;
    new.cortesia  := false;
  elsif (new.teste_ate, new.pago_ate, new.cortesia)
        is distinct from (old.teste_ate, old.pago_ate, old.cortesia) then
    raise exception 'O plano do grupo só muda pela assinatura.';
  end if;
  return new;
end;
$$;
drop trigger if exists groups_proteger_plano on public.groups;
create trigger groups_proteger_plano
  before insert or update on public.groups
  for each row execute function public.proteger_plano();

-- Está no pago? Cortesia, assinatura em dia, ou ainda no teste
create or replace function public.grupo_premium(gid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((
    select g.cortesia
        or coalesce(g.pago_ate > now(), false)
        or coalesce(g.teste_ate > now(), false)
      from public.groups g where g.id = gid), false);
$$;
revoke execute on function public.grupo_premium(uuid) from public, anon;
grant  execute on function public.grupo_premium(uuid) to authenticated;

-- ── Administrador extra: vê sempre, edita só com o plano ──
-- A regra de LER quem é administrador (dono ou organizador), como era a
-- can_manage_group até aqui. Serve ao Financeiro: lá "membro" não basta — o
-- papel 'jogador' também é membro e não pode ver dinheiro de ninguém.
create or replace function public.e_admin_do_grupo(gid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid() and role in ('dono', 'organizador'));
$$;
revoke execute on function public.e_admin_do_grupo(uuid) from public, anon;
grant  execute on function public.e_admin_do_grupo(uuid) to authenticated;

-- A regra de EDITAR. Todas as políticas de escrita e as funções salvar_*
-- já passam por aqui; as leituras usam is_group_member, que não muda. Por
-- isso trocar o corpo desta função basta: o dono edita sempre, o organizador
-- só com o plano.
create or replace function public.can_manage_group(gid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid()
      and (role = 'dono' or (role = 'organizador' and public.grupo_premium(gid))));
$$;

-- O Financeiro continua legível para todo administrador, com ou sem plano
drop policy if exists cobrancas_ler on public.cobrancas;
create policy cobrancas_ler on public.cobrancas
  for select using (public.e_admin_do_grupo(group_id));
drop policy if exists pagamentos_ler on public.pagamentos;
create policy pagamentos_ler on public.pagamentos
  for select using (public.e_admin_do_grupo(group_id));
drop policy if exists despesas_ler on public.despesas;
create policy despesas_ler on public.despesas
  for select using (public.e_admin_do_grupo(group_id));
drop policy if exists lembretes_ler on public.lembretes;
create policy lembretes_ler on public.lembretes
  for select using (public.e_admin_do_grupo(group_id));

-- ── Financeiro: sem plano, só leitura ──
-- Nas tabelas, e não em cada função: pega pagamento, despesa, estorno,
-- avulsa e diária pelo mesmo lugar.
create or replace function public.financeiro_do_plano()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.grupo_premium(new.group_id) then
    return new;
  end if;
  -- O que o SISTEMA lança sozinho não nasce, em silêncio: a mensalidade do
  -- mês e a diária antecipada. Levantar erro ali quebraria a confirmação do
  -- convidado no link e a sincronização do administrador
  -- (ifs aninhados: o gatilho serve a quatro tabelas, e só cobrancas tem tipo)
  if tg_table_name = 'cobrancas' then
    if new.tipo = 'mensalidade' or (new.tipo = 'diaria' and new.criada_por is null) then
      return null;
    end if;
  end if;
  raise exception 'O Financeiro é do plano pago. Sem ele, dá para consultar, mas não lançar.';
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['cobrancas', 'pagamentos', 'despesas', 'lembretes'] loop
    execute format('drop trigger if exists %I_do_plano on public.%I', t, t);
    execute format(
      'create trigger %I_do_plano before insert on public.%I for each row execute function public.financeiro_do_plano()',
      t, t);
  end loop;
end $$;

-- Cancelar à mão também é lançar. O sistema (cancelada_por nulo) continua
-- cancelando a diária de quem perdeu a vaga, e reativando a de quem voltou
create or replace function public.cancelar_do_plano()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.cancelada_em is not null and old.cancelada_em is null and new.cancelada_por is not null
     and not public.grupo_premium(new.group_id) then
    raise exception 'O Financeiro é do plano pago. Sem ele, dá para consultar, mas não lançar.';
  end if;
  return new;
end;
$$;
drop trigger if exists cobrancas_cancelar_do_plano on public.cobrancas;
create trigger cobrancas_cancelar_do_plano
  before update on public.cobrancas
  for each row execute function public.cancelar_do_plano();

-- ── Mais de um administrador ──
create or replace function public.admin_do_plano()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- (ifs aninhados: só group_members tem role)
  if tg_table_name = 'group_members' then
    if new.role is distinct from 'organizador' then
      return new;
    end if;
  end if;
  if not public.grupo_premium(new.group_id) then
    raise exception 'Mais de um administrador é do plano pago.';
  end if;
  return new;
end;
$$;
drop trigger if exists admin_invites_do_plano on public.admin_invites;
create trigger admin_invites_do_plano
  before insert on public.admin_invites
  for each row execute function public.admin_do_plano();
drop trigger if exists group_members_do_plano on public.group_members;
create trigger group_members_do_plano
  before insert on public.group_members
  for each row execute function public.admin_do_plano();

-- ── Até 20 mensalistas no grátis ──
-- Conta o mensalista ativo, aprovado e não excluído. Convidado não conta. Só
-- trava quem ENTRA na conta — cadastro novo, aprovação, reativação, virar
-- mensalista —: quem já contava continua sendo editado e sincronizado, então
-- um grupo com 25 que perde o plano não perde ninguém.
create or replace function public.limite_de_mensalistas()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  conta boolean := coalesce(new.kind, 'mensalista') = 'mensalista'
                   and new.active and not new.pending and new.deleted_at is null;
  ja_contava boolean;
begin
  if not conta then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    ja_contava := coalesce(old.kind, 'mensalista') = 'mensalista'
                  and old.active and not old.pending and old.deleted_at is null;
  else
    -- salvar_jogadores faz insert ... on conflict: o insert de quem já existe
    -- passa por aqui antes de virar update
    select coalesce(p.kind, 'mensalista') = 'mensalista' and p.active and not p.pending and p.deleted_at is null
      into ja_contava from public.players p where p.id = new.id;
  end if;
  if coalesce(ja_contava, false) or public.grupo_premium(new.group_id) then
    return new;
  end if;
  if (select count(*) from public.players p
       where p.group_id = new.group_id and p.id <> new.id
         and coalesce(p.kind, 'mensalista') = 'mensalista'
         and p.active and not p.pending and p.deleted_at is null) >= 20 then
    raise exception 'O plano grátis vai até 20 mensalistas. Para ter mais, assine o plano do grupo.';
  end if;
  return new;
end;
$$;
drop trigger if exists players_limite_de_mensalistas on public.players;
create trigger players_limite_de_mensalistas
  before insert or update on public.players
  for each row execute function public.limite_de_mensalistas();
