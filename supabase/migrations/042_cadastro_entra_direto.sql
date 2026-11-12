-- 042 · Cadastro pelo link entra direto no grupo (pelada)
--
-- Pedido do Guilherme em 12/11/2026: quem se cadastra pelo link já deveria ter
-- acesso ao grupo, sem esperar o administrador aprovar. Antes, todo cadastro
-- ficava pendente (players.pending) e a pessoa não aparecia em link nenhum.
--
-- Agora, na pelada (amador), o cadastro entra aprovado e a função devolve o
-- código do link do jogo, para a tela abrir a lista já como aquela pessoa
-- (`/#/c/CÓDIGO?eu=ID`). Continua PENDENTE, para o administrador decidir:
--
--   - nome igual (sem caixa) ao de alguém que já está no grupo, ou o mesmo
--     telefone: provavelmente é a mesma pessoa completando o cadastro. A
--     junção nunca é automática (migração 009): se fosse, qualquer um com o
--     link escreveria telefone e nascimento no cadastro de outra pessoa;
--   - grupo no plano grátis que já tem 20 mensalistas: o gatilho
--     limite_de_mensalistas recusaria, e a pessoa ficaria sem cadastro.
--
-- Por que é seguro: o link de cadastro só chega a quem o administrador mandou,
-- e quem se cadastra passa a ver o mesmo que qualquer mensalista vê no link
-- do jogo (nomes e respostas). Telefone e nascimento continuam fora das
-- funções guest_*. O administrador tira quem não é do grupo em Atletas.
--
-- O modo profissional (técnico) não muda: o atleta continua esperando a
-- aprovação do técnico.
--
-- Rodar uma vez no SQL Editor, DEPOIS da 041. Não apaga dados nem muda
-- tabela: troca a função de cadastro (que passa a devolver jsonb em vez de
-- nada; o app antigo ignora o retorno, então a ordem com o deploy não importa).

drop function if exists public.guest_register(text, text, date, text, text, int, text);

create or replace function public.guest_register(
  code text, p_name text, p_birth date, p_phone text, p_position text, p_level int,
  p_nickname text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g public.groups; nome text; apelido text; fone text; pendentes int;
  direto boolean; novo uuid;
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

  -- O mesmo pedido duas vezes continua barrado
  if exists (select 1 from public.players
              where group_id = g.id and active and pending and deleted_at is null
                and lower(name) = lower(nome)) then
    raise exception 'Seu cadastro já foi enviado e está aguardando a aprovação do organizador.';
  end if;

  -- Entra direto se não parece alguém que já está no grupo e cabe no plano
  direto := not exists (
              select 1 from public.players
               where group_id = g.id and active and not pending and deleted_at is null
                 and (lower(name) = lower(nome)
                      or regexp_replace(coalesce(phone, ''), '\D', '', 'g') = fone))
            and (public.grupo_premium(g.id)
                 or (select count(*) from public.players p
                      where p.group_id = g.id
                        and coalesce(p.kind, 'mensalista') = 'mensalista'
                        and p.active and not p.pending and p.deleted_at is null) < 20);

  if not direto then
    -- Teto de pedidos em aberto: o link circula no WhatsApp
    select count(*) into pendentes from public.players
     where group_id = g.id and active and pending;
    if pendentes >= 50 then
      raise exception 'Muitos cadastros aguardando aprovação. Fale com o organizador.';
    end if;
  end if;

  insert into public.players
    (group_id, name, nickname, skills, positions, birth_date, phone, kind, pending, added_via_link)
  values (
    g.id, nome, apelido,
    jsonb_build_object(g.sport, p_level),
    case when coalesce(p_position, '') = '' then '{}'::jsonb
         else jsonb_build_object(g.sport, p_position) end,
    p_birth, fone, 'mensalista', not direto, true)
  returning id into novo;

  if direto then
    return jsonb_build_object('status', 'aprovado', 'player', novo, 'code', g.invite_code);
  end if;
  return jsonb_build_object('status', 'pendente');
end;
$$;

revoke execute on function public.guest_register(text, text, date, text, text, int, text) from public;
grant  execute on function public.guest_register(text, text, date, text, text, int, text) to anon, authenticated;
