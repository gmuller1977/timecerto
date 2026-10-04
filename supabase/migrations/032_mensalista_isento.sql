-- 032 · Mensalista isento aparece com ✅
--
-- Pedido do Guilherme em 05/10/2026. Quem teve a mensalidade do mês cancelada
-- (isento, não joga no mês) aparecia na lista do grupo sem ✅, como se
-- estivesse devendo. Agora a lista do link diz quem está isento, e o app põe o
-- ✅ nele — no Financeiro e no link.
--
-- Rodar uma vez no SQL Editor, DEPOIS da 031. Não apaga dados: só troca a
-- função que monta a lista (mensalidade_do_mes), com um campo a mais.

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
               'informadoEm', a.informado_em,
               -- Isento: a mensalidade do mês foi cancelada e não há outra valendo
               'isento', a.id is null and exists (
                 select 1 from public.cobrancas x
                  where x.group_id = gid and x.player_id = p.id and x.tipo = 'mensalidade'
                    and x.referencia = ref and x.cancelada_em is not null))
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
