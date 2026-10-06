-- 037 · Plano VIP: o modo profissional, com teste de 30 dias por conta
--
-- Decidido pelo Guilherme em 06/10/2026. Três planos:
--   - Grátis;
--   - Pago (R$ 14,90): Financeiro completo, vários administradores, sem limite
--     de mensalistas — o que a 021 já trava;
--   - VIP (R$ 24,90): tudo do Pago + o modo profissional.
--
-- O teste do VIP é de 30 dias, UMA VEZ POR CONTA: começa quando a pessoa cria
-- o primeiro time profissional, e todo time profissional dela vale até a mesma
-- data. Os donos de time profissional que já existem ganham os 30 dias a
-- partir de hoje.
--
-- Acabado o teste sem assinatura, o time profissional fica só para consulta:
-- nada se perde, só trava — a mesma regra do Pago. Aqui no banco, isso é o
-- grupo_premium falso (organizador perde a edição, Financeiro, administradores
-- e limite travam); a tela do time esconde criar jogo, escalar e começar.
--
-- Rodar uma vez no SQL Editor, DEPOIS da 036. Não apaga dados: cria uma
-- tabela, duas colunas, e troca três funções.

-- ── O teste do VIP, uma linha por conta ──
-- Sem política nenhuma: só as funções abaixo mexem (ninguém estende o próprio)
create table if not exists public.vip_teste (
  user_id uuid primary key references auth.users on delete cascade,
  ate     timestamptz not null
);
alter table public.vip_teste enable row level security;

-- Começa o teste da conta, se ainda não começou. Devolve até quando vai
create or replace function public.iniciar_vip_teste(uid uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare fim timestamptz;
begin
  insert into public.vip_teste (user_id, ate) values (uid, now() + interval '30 days')
  on conflict (user_id) do nothing;
  select ate into fim from public.vip_teste where user_id = uid;
  return fim;
end;
$$;
revoke execute on function public.iniciar_vip_teste(uuid) from public, anon, authenticated;

-- ── O VIP no grupo ──
alter table public.groups
  -- VIP pago até: quem preenche é o Mercado Pago (fase 2), como o pago_ate
  add column if not exists vip_ate       timestamptz,
  -- O fim do teste VIP do dono, copiado na criação do time profissional
  add column if not exists vip_teste_ate timestamptz;

-- O grupo não mexe no próprio plano (021) — agora com as colunas do VIP
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
    new.vip_ate   := null;
    new.vip_teste_ate := case when new.mode = 'profissional'
                              then public.iniciar_vip_teste(new.owner_id) end;
  elsif (new.teste_ate, new.pago_ate, new.cortesia, new.vip_ate, new.vip_teste_ate)
        is distinct from (old.teste_ate, old.pago_ate, old.cortesia, old.vip_ate, old.vip_teste_ate) then
    raise exception 'O plano do grupo só muda pela assinatura.';
  end if;
  return new;
end;
$$;

-- Tem o plano completo? Time profissional: só com VIP (cortesia, VIP pago ou
-- teste VIP). Pelada: o Pago de sempre — e o VIP, que inclui tudo do Pago
create or replace function public.grupo_premium(gid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((
    select g.cortesia
        or coalesce(g.vip_ate > now(), false)
        or case when g.mode = 'profissional'
                then coalesce(g.vip_teste_ate > now(), false)
                else coalesce(g.pago_ate > now(), false) or coalesce(g.teste_ate > now(), false)
           end
      from public.groups g where g.id = gid), false);
$$;

-- ── Os times profissionais que já existem: 30 dias a partir de hoje ──
-- (o SQL Editor roda como postgres, e o proteger_plano deixa passar)
insert into public.vip_teste (user_id, ate)
select distinct g.owner_id, now() + interval '30 days'
  from public.groups g
 where g.mode = 'profissional'
on conflict (user_id) do nothing;

update public.groups g
   set vip_teste_ate = v.ate
  from public.vip_teste v
 where g.mode = 'profissional' and v.user_id = g.owner_id and g.vip_teste_ate is null;
