-- 040 · A lista do jogo pelo link, com ✅ em quem já pagou
--
-- Pedido do Guilherme em 12/10/2026. O convidado que confirma o pagamento na
-- aba Pagamento manda de volta no grupo a lista do jogo, no mesmo modelo da
-- cobrança do Financeiro (mensagemDoDia): todos os convidados daquele jogo,
-- com ✅ em quem já pagou ou confirmou pelo link. Ninguém sai da lista. É o
-- mesmo desenho da lista da mensalidade (031/032) para o mensalista.
--
-- O link só recebe nomes e o ✅ — o valor é o da diária, o mesmo da cobrança
-- que foi para o grupo. Pago segue a regra do app: o pagamento abate as
-- cobranças mais antigas primeiro (lib/financeiro.ts, saldosPorJogador).
--
-- Rodar uma vez no SQL Editor, DEPOIS da 039. Não apaga nem altera dados:
-- cria uma função.

create or replace function public.guest_diarias_do_jogo(code text, p_player uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r record; g public.groups;
begin
  select * into r from public.guest_resolve(code);
  if not exists (select 1 from public.players
                  where id = p_player and group_id = r.gid and active and not pending
                    and deleted_at is null
                    and (r.via = 'mensalistas' or kind = 'convidado')) then
    raise exception 'Jogador não encontrado neste grupo';
  end if;
  select * into g from public.groups where id = r.gid;

  return jsonb_build_object(
    'pixChave', g.pix_chave,
    'jogos', coalesce((
      with pagos as (
        select player_id, sum(valor_cents) as total
          from public.pagamentos where group_id = r.gid group by player_id
      ),
      acumulado as (
        select c.id, c.player_id, c.tipo, c.referencia, c.vence_em, c.valor_cents, c.informado_em,
               sum(c.valor_cents) over (partition by c.player_id
                                        order by c.vence_em, c.criada_em, c.id) as ate_aqui
          from public.cobrancas c
         where c.group_id = r.gid and c.cancelada_em is null
      ),
      diarias as (
        select a.referencia, min(a.vence_em) as vence_em, a.player_id,
               sum(a.valor_cents) as valor_cents,
               bool_and(coalesce(pg.total, 0) >= a.ate_aqui or a.informado_em is not null) as ok
          from acumulado a
          left join pagos pg on pg.player_id = a.player_id
         where a.tipo = 'diaria' and a.referencia is not null
         group by a.referencia, a.player_id
      ),
      -- Os jogos desta pessoa nos últimos 60 dias, os mais recentes primeiro
      jogos as (
        select d.referencia, d.vence_em
          from diarias d
         where d.player_id = p_player
           and d.vence_em >= (now() at time zone 'America/Sao_Paulo')::date - 60
         order by d.vence_em desc
         limit 3
      )
      select jsonb_agg(jsonb_build_object(
               'referencia', j.referencia,
               'data', j.vence_em,
               'eu', (select d.ok from diarias d
                       where d.referencia = j.referencia and d.player_id = p_player),
               'convidados', (
                 select jsonb_agg(jsonb_build_object(
                          'name', coalesce(nullif(p.nickname, ''), p.name),
                          'valorCents', d.valor_cents,
                          'ok', d.ok)
                        order by coalesce(nullif(p.nickname, ''), p.name))
                   from diarias d
                   join public.players p on p.id = d.player_id
                  where d.referencia = j.referencia))
             order by j.vence_em desc)
        from jogos j
    ), '[]'::jsonb)
  );
end;
$$;
