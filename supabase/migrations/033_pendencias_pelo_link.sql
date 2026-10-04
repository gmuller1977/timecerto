-- 033 · As pendências de cada um, confirmadas pelo link
--
-- Pedido do Guilherme em 05/10/2026. A cobrança individual passa a ser uma
-- mensagem só, igual para mensalista e convidado, terminando em "Após o
-- pagamento, clique no link abaixo e confirme o valor". Então o "Já paguei"
-- do link vale para TUDO o que a pessoa tem em aberto — diárias, mensalidades,
-- avulsas (a 031 cobria só a mensalidade do mês).
--
-- O que falta de cada cobrança segue a regra do app: o pagamento abate as
-- mais antigas primeiro (lib/financeiro.ts, saldosPorJogador).
--
-- Informar continua não sendo baixa: fica "a conferir" no Financeiro.
--
-- O link NÃO mostra itens nem valores (pedido do Guilherme no mesmo dia): só
-- sabe se há algo em aberto e se já foi confirmado. A lista aparece apenas na
-- mensagem do grupo. Assim, tocar no nome de outra pessoa não revela o que
-- ela deve.
--
-- Rodar uma vez no SQL Editor, DEPOIS da 032. Não apaga dados: cria três
-- funções.

-- ── O que está em aberto de um jogador, com quanto falta de cada um ──
create or replace function public.pendencias_do_jogador(gid uuid, p_player uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with pago as (
    select coalesce(sum(valor_cents), 0) as total
      from public.pagamentos where group_id = gid and player_id = p_player
  ),
  acumulado as (
    select c.id, c.tipo, c.descricao, c.vence_em, c.valor_cents, c.informado_em, c.criada_em,
           sum(c.valor_cents) over (order by c.vence_em, c.criada_em, c.id) as ate_aqui
      from public.cobrancas c
     where c.group_id = gid and c.player_id = p_player and c.cancelada_em is null
  ),
  abertas as (
    select a.*, least(a.valor_cents, greatest(0, a.ate_aqui - pago.total)) as falta
      from acumulado a, pago
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'tipo', tipo, 'descricao', descricao, 'venceEm', vence_em,
           'faltaCents', falta, 'informadoEm', informado_em)
         order by vence_em, criada_em, id) filter (where falta > 0), '[]'::jsonb)
    from abertas;
$$;
revoke execute on function public.pendencias_do_jogador(uuid, uuid) from public, anon, authenticated;

-- Quem pode ser consultado: no link do jogo, qualquer um do grupo; no de
-- convidados, só convidado (a mesma regra de responder presença)

-- ── Pelo link: tenho algo em aberto? já confirmei? ──
create or replace function public.guest_pendencias(code text, p_player uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r record; abertas jsonb;
begin
  select * into r from public.guest_resolve(code);
  if not exists (select 1 from public.players
                  where id = p_player and group_id = r.gid and active and not pending
                    and deleted_at is null
                    and (r.via = 'mensalistas' or kind = 'convidado')) then
    raise exception 'Jogador não encontrado neste grupo';
  end if;
  abertas := public.pendencias_do_jogador(r.gid, p_player);
  -- Só o estado, nunca itens ou valores
  return jsonb_build_object(
    'emAberto', jsonb_array_length(abertas) > 0,
    'confirmado', jsonb_array_length(abertas) > 0
                  and not exists (select 1 from jsonb_array_elements(abertas) x
                                   where x ->> 'informadoEm' is null));
end;
$$;

-- ── Pelo link: "Já paguei" — tudo o que está em aberto agora ──
create or replace function public.guest_informar_pendencias(code text, p_player uuid)
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int;
begin
  select * into r from public.guest_resolve(code);
  if not exists (select 1 from public.players
                  where id = p_player and group_id = r.gid and active and not pending
                    and deleted_at is null
                    and (r.via = 'mensalistas' or kind = 'convidado')) then
    raise exception 'Jogador não encontrado neste grupo';
  end if;
  update public.cobrancas c set informado_em = now()
   where c.informado_em is null
     and c.id in (select (x ->> 'id')::uuid
                    from jsonb_array_elements(public.pendencias_do_jogador(r.gid, p_player)) x);
  get diagnostics n = row_count;
  return n;
end;
$$;
