-- 022 · O profissional entra no plano
--
-- Decidido pelo Guilherme em 30/09/2026, junto com as mesmas abas no
-- profissional (Jogo, Atletas, Financeiro, Ajustes): o time tem Financeiro,
-- e o Financeiro é do plano — então o time passa a ter plano como a pelada.
-- Na 021 o profissional tinha ficado de fora (grupo_premium dizia sim).
--
-- Os times que já existem ganham 30 dias de teste a partir de agora; os que
-- têm cortesia ou assinatura continuam como estão. O limite do grátis vale
-- igual: o elenco do time conta como mensalista (é assim que ele sobe para
-- players, kind padrão).

create or replace function public.grupo_premium(gid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((
    select g.cortesia
        or coalesce(g.pago_ate > now(), false)
        or coalesce(g.teste_ate > now(), false)
      from public.groups g where g.id = gid), false);
$$;

update public.groups
   set teste_ate = now() + interval '30 days'
 where mode = 'profissional'
   and not cortesia
   and pago_ate is null;
