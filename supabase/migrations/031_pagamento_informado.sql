-- 031 · O mensalista informa que pagou, pelo link do jogo
--
-- Pedido do Guilherme em 05/10/2026. A cobrança da mensalidade vai para o
-- grupo do WhatsApp com a lista dos mensalistas; quem paga entra no link do
-- jogo e toca em "Já paguei", e o nome dele ganha um ✅ na lista que ele mesmo
-- manda de volta para o grupo.
--
-- Informar NÃO é dar baixa: o pagamento fica "a conferir" no Financeiro até
-- o administrador conferir no extrato e registrar (decidido no mesmo dia).
-- Ninguém marca pago sem ter pago — o link é público dentro do grupo.
--
-- O ✅ vale para quem informou e para quem já está pago de verdade (baixa do
-- administrador, inclusive em dinheiro). "Pago" segue a regra do app: o
-- pagamento abate as cobranças mais antigas primeiro (lib/financeiro.ts,
-- saldosPorJogador).
--
-- Rodar uma vez no SQL Editor, DEPOIS da 030. Não apaga dados: cria uma
-- coluna e três funções.

alter table public.cobrancas add column if not exists informado_em timestamptz;

-- ── A mensalidade do mês, mensalista por mensalista ──
create or replace function public.mensalidade_do_mes(gid uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g public.groups; hoje date; ref text;
begin
  select * into g from public.groups where id = gid;
  if g.id is null or g.mensalidade_cents is null or g.mensalidade_dia is null then
    return null;
  end if;
  hoje := (now() at time zone 'America/Sao_Paulo')::date;
  ref := to_char(hoje, 'YYYY-MM');

  return jsonb_build_object(
    'mes', ref,
    'venceEm', make_date(extract(year from hoje)::int, extract(month from hoje)::int, g.mensalidade_dia),
    'valorCents', g.mensalidade_cents,
    'pix', jsonb_build_object('chave', g.pix_chave, 'nome', g.pix_nome, 'cidade', g.pix_cidade),
    'mensalistas', coalesce((
      with pagos as (
        select player_id, sum(valor_cents) as total
          from public.pagamentos where group_id = gid group by player_id
      ),
      acumulado as (
        select c.id, c.player_id, c.referencia, c.tipo, c.informado_em,
               sum(c.valor_cents) over (partition by c.player_id
                                        order by c.vence_em, c.criada_em, c.id) as ate_aqui
          from public.cobrancas c
         where c.group_id = gid and c.cancelada_em is null
      )
      select jsonb_agg(jsonb_build_object(
               'id', p.id,
               'name', coalesce(nullif(p.nickname, ''), p.name),
               'temCobranca', a.id is not null,
               'pago', a.id is not null and coalesce(pg.total, 0) >= a.ate_aqui,
               'informadoEm', a.informado_em)
             order by coalesce(nullif(p.nickname, ''), p.name))
        from public.players p
        left join acumulado a on a.player_id = p.id and a.tipo = 'mensalidade' and a.referencia = ref
        left join pagos pg on pg.player_id = p.id
       where p.group_id = gid and p.kind = 'mensalista'
         and p.active and not p.pending and p.deleted_at is null
    ), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.mensalidade_do_mes(uuid) from public, anon, authenticated;

-- ── Pelo link: a mensalidade do mês (só no link do jogo) ──
create or replace function public.guest_mensalidade(code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r record;
begin
  select * into r from public.guest_resolve(code);
  if r.via <> 'mensalistas' then
    return null;
  end if;
  return public.mensalidade_do_mes(r.gid);
end;
$$;

-- ── Pelo link: "Já paguei" ──
create or replace function public.guest_informar_pagamento(code text, p_player uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record; ref text; n int;
begin
  select * into r from public.guest_resolve(code);
  if r.via <> 'mensalistas' then
    raise exception 'Convite inválido';
  end if;
  if not exists (select 1 from public.players
                  where id = p_player and group_id = r.gid and kind = 'mensalista'
                    and active and not pending and deleted_at is null) then
    raise exception 'Mensalista não encontrado neste grupo';
  end if;
  ref := to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM');
  update public.cobrancas set informado_em = now()
   where group_id = r.gid and player_id = p_player and tipo = 'mensalidade'
     and referencia = ref and cancelada_em is null and informado_em is null;
  get diagnostics n = row_count;
  if n = 0 and not exists (select 1 from public.cobrancas
                            where group_id = r.gid and player_id = p_player and tipo = 'mensalidade'
                              and referencia = ref and cancelada_em is null) then
    raise exception 'A mensalidade deste mês ainda não foi lançada. Avise o organizador.';
  end if;
end;
$$;

-- ── O administrador: "não recebi" ──
create or replace function public.desfazer_informado(p_cobranca uuid)
returns void language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  select group_id into gid from public.cobrancas where id = p_cobranca;
  if gid is null or not public.can_manage_group(gid) then
    raise exception 'Sem permissão neste grupo';
  end if;
  update public.cobrancas set informado_em = null where id = p_cobranca;
end;
$$;
revoke execute on function public.desfazer_informado(uuid) from public, anon;
grant  execute on function public.desfazer_informado(uuid) to authenticated;
