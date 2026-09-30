-- 027 · Link de cadastro de atleta, para o time
--
-- Pedido do Guilherme em 30/09/2026: o mesmo link de cadastro da pelada,
-- agora no profissional. O administrador entra no time, vai em Atletas, e
-- cadastra à mão ou manda o link; quem preenche fica aguardando aprovação.
--
-- Todo grupo já tem register_code (a coluna nasceu com padrão). O que muda:
--   - guest_register_info passa a responder para o time, dizendo o tipo, a
--     categoria e o naipe dele (a página mostra o formulário certo);
--   - guest_register_atleta: o pedido do atleta. Categoria e naipe vêm do
--     TIME (migração 024), e não do formulário; posições em ordem, a primeira
--     é a principal (migração 026). O guest_register da pelada não muda.

create or replace function public.guest_register_info(code text)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare g public.groups;
begin
  select * into g from public.groups where register_code = upper(code);
  if g.id is null then
    raise exception 'Link de cadastro inválido';
  end if;
  return jsonb_build_object(
    'name', g.name, 'sport', g.sport, 'mode', g.mode,
    'ageGroup', g.age_group, 'naipe', g.naipe);
end;
$$;
revoke execute on function public.guest_register_info(text) from public;
grant  execute on function public.guest_register_info(text) to anon, authenticated;

create or replace function public.guest_register_atleta(
  code text, p_name text, p_birth date, p_phone text,
  p_posicoes text[], p_height int, p_weight numeric)
returns void language plpgsql security definer set search_path = public as $$
declare g public.groups; nome text; fone text; pendentes int; posicoes text[];
begin
  select * into g from public.groups where register_code = upper(code) and mode = 'profissional';
  if g.id is null then
    raise exception 'Link de cadastro inválido';
  end if;

  nome := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  if length(nome) < 2 or length(nome) > 40 then
    raise exception 'Nome precisa ter entre 2 e 40 letras';
  end if;
  fone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if fone !~ '^[0-9]{10,13}$' then
    raise exception 'Telefone inválido — use DDD e número';
  end if;
  if p_birth is null or p_birth > current_date or p_birth < current_date - interval '100 years' then
    raise exception 'Data de nascimento inválida';
  end if;
  if p_height is not null and p_height not between 80 and 250 then
    raise exception 'Altura inválida';
  end if;
  if p_weight is not null and p_weight not between 20 and 250 then
    raise exception 'Peso inválido';
  end if;
  -- Só posições do vôlei, sem repetir, na ordem em que vieram
  select coalesce(array_agg(p order by i), '{}') into posicoes
    from (select distinct on (p) p, i
            from unnest(coalesce(p_posicoes, '{}')) with ordinality as t(p, i)
           where p in ('levantador', 'oposto', 'ponteiro', 'central', 'libero')
           order by p, i) x;

  if exists (select 1 from public.players
              where group_id = g.id and active and pending and lower(name) = lower(nome)) then
    raise exception 'Seu cadastro já foi enviado e está aguardando a aprovação do técnico.';
  end if;
  select count(*) into pendentes from public.players
   where group_id = g.id and active and pending;
  if pendentes >= 50 then
    raise exception 'Muitos cadastros aguardando aprovação. Fale com o técnico.';
  end if;

  insert into public.players
    (group_id, name, positions, outras_posicoes, birth_date, phone, height_cm, weight_kg,
     age_group, naipe, kind, pending, added_via_link)
  values (
    g.id, nome,
    case when cardinality(posicoes) = 0 then '{}'::jsonb else jsonb_build_object('volei', posicoes[1]) end,
    coalesce(posicoes[2:], '{}'),
    p_birth, fone, p_height, p_weight,
    g.age_group, g.naipe, 'mensalista', true, true);
end;
$$;
revoke execute on function public.guest_register_atleta(text, text, date, text, text[], int, numeric) from public;
grant  execute on function public.guest_register_atleta(text, text, date, text, text[], int, numeric) to anon, authenticated;
