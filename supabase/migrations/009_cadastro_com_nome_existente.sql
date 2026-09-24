-- ─────────────────────────────────────────────────────────────
-- 009 — Cadastro pelo link com nome que já existe
--
-- Antes, o link de cadastro recusava qualquer nome já presente no grupo
-- ("Já existe um cadastro com esse nome"). Quem mais batia nisso era
-- justamente quem JÁ faz parte do grupo — o administrador cadastrou a pessoa
-- antes, e ela ia pelo link completar nascimento e telefone. Ficava travada,
-- e os dados dela nunca chegavam.
--
-- Agora o pedido passa como pendente, e o administrador decide em Atletas:
-- "Juntar com <fulano>" (os dados do pedido vão para o cadastro existente)
-- ou "Aprovar como pessoa nova" (homônimo de verdade).
--
-- A junção nunca é automática, e é de propósito: se o banco juntasse sozinho
-- pelo nome, qualquer um com o link escreveria telefone e nascimento no
-- cadastro de outra pessoa só digitando o nome dela.
--
-- Continua barrado: o MESMO pedido duas vezes (já há um pendente com esse
-- nome) — a pessoa só precisa esperar a aprovação.
--
-- Rodar uma vez no SQL Editor, DEPOIS da 008. Não apaga dados nem muda
-- tabela: só troca a função de cadastro.
-- ─────────────────────────────────────────────────────────────

create or replace function public.guest_register(
  code text, p_name text, p_birth date, p_phone text, p_position text, p_level int,
  p_nickname text default null)
returns void language plpgsql security definer set search_path = public as $$
declare g public.groups; nome text; apelido text; fone text; pendentes int;
begin
  select * into g from public.groups where register_code = upper(code) and mode = 'amador';
  if g.id is null then
    raise exception 'Link de cadastro inválido';
  end if;

  nome := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  if length(nome) < 2 or length(nome) > 40 then
    raise exception 'Nome precisa ter entre 2 e 40 letras';
  end if;
  apelido := nullif(btrim(regexp_replace(coalesce(p_nickname, ''), '\s+', ' ', 'g')), '');
  if apelido is not null and length(apelido) > 20 then
    raise exception 'Apelido pode ter até 20 letras';
  end if;
  fone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if fone !~ '^[0-9]{10,13}$' then
    raise exception 'Telefone inválido — use DDD e número';
  end if;
  if p_birth is null or p_birth > current_date or p_birth < current_date - interval '100 years' then
    raise exception 'Data de nascimento inválida';
  end if;
  if p_level is null or p_level not between 1 and 5 then
    raise exception 'Nível precisa ser de 1 a 5';
  end if;

  -- Só o pedido repetido é barrado. Nome de quem já está no grupo passa:
  -- o administrador junta na aprovação.
  if exists (select 1 from public.players
              where group_id = g.id and active and pending and lower(name) = lower(nome)) then
    raise exception 'Seu cadastro já foi enviado e está aguardando a aprovação do organizador.';
  end if;

  -- Teto de pedidos em aberto: o link circula no WhatsApp
  select count(*) into pendentes from public.players
   where group_id = g.id and active and pending;
  if pendentes >= 50 then
    raise exception 'Muitos cadastros aguardando aprovação. Fale com o organizador.';
  end if;

  insert into public.players
    (group_id, name, nickname, skills, positions, birth_date, phone, kind, pending, added_via_link)
  values (
    g.id, nome, apelido,
    jsonb_build_object(g.sport, p_level),
    case when coalesce(p_position, '') = '' then '{}'::jsonb
         else jsonb_build_object(g.sport, p_position) end,
    p_birth, fone, 'mensalista', true, true);
end;
$$;

revoke execute on function public.guest_register(text, text, date, text, text, int, text) from public;
grant  execute on function public.guest_register(text, text, date, text, text, int, text) to anon, authenticated;
