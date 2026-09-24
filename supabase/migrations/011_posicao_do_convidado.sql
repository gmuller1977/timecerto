-- ─────────────────────────────────────────────────────────────
-- 011 — Posição do convidado
--
-- O convidado entrava só com o nome, e nascia sem posição: o sorteio não
-- sabia se ele era levantador ou goleiro. Agora ele informa a posição ao se
-- inscrever pelo link de convidados, e o mensalista informa a posição de quem
-- ele leva. Pedido do Guilherme em 24/09/2026.
--
-- A tela obriga a escolher; aqui o parâmetro é OPCIONAL de propósito: quem
-- estiver com a versão antiga do app aberta na hora da troca não pode ficar
-- travado sem conseguir se inscrever. A posição é sugestão, como o nível do
-- mensalista — o administrador ajusta em Atletas.
--
-- Convidado que volta (mesmo nome) só ganha posição se ainda não tinha: não
-- sobrescreve o que o administrador ajustou.
--
-- Continua: só mensalista leva convidado (guest_add_player confere).
--
-- Rodar uma vez no SQL Editor, DEPOIS da 010. Não apaga dados nem muda
-- tabela: troca três funções por versões com posição (as antigas saem, para
-- não ficarem duas com o mesmo nome).
-- ─────────────────────────────────────────────────────────────

drop function if exists public.guest_join(text, uuid, text);
drop function if exists public.guest_add_player(text, uuid, text, uuid);
drop function if exists public.guest_upsert_convidado(uuid, uuid, text, uuid);

-- Convidado entra (ou volta) e confirma. Uso interno das duas portas.
create or replace function public.guest_upsert_convidado(
  gid uuid, p_event uuid, p_name text, p_invited_by uuid, p_position text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare nome text; posicao text; existente public.players; v_sport text; novo uuid; qtd int;
begin
  nome := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  if length(nome) < 2 or length(nome) > 40 then
    raise exception 'Nome precisa ter entre 2 e 40 letras';
  end if;
  posicao := nullif(btrim(coalesce(p_position, '')), '');
  if posicao is not null and length(posicao) > 30 then
    raise exception 'Posição inválida';
  end if;
  if not exists (select 1 from public.events
                  where id = p_event and group_id = gid and not closed) then
    raise exception 'Este jogo não aceita mais respostas';
  end if;
  if exists (select 1 from public.events where id = p_event and list_closed) then
    raise exception 'A lista deste jogo está fechada. Fale com o organizador.';
  end if;

  select sport into v_sport from public.groups where id = gid;

  select * into existente from public.players
   where group_id = gid and active and lower(name) = lower(nome)
   limit 1;

  if existente.id is not null and existente.kind = 'mensalista' then
    raise exception 'Esse nome está na lista de mensalistas — use o link dos mensalistas';
  end if;

  if existente.id is not null then
    novo := existente.id;
    -- Quem volta só ganha posição se não tinha: não desfaz o ajuste do administrador
    if posicao is not null and coalesce(existente.positions ->> v_sport, '') = '' then
      update public.players
         set positions  = coalesce(positions, '{}'::jsonb) || jsonb_build_object(v_sport, posicao),
             updated_at = now()
       where id = existente.id;
    end if;
  else
    -- Teto por jogo: o link é público dentro do WhatsApp
    select count(*) into qtd
      from public.attendance a join public.players p on p.id = a.player_id
     where a.event_id = p_event and p.kind = 'convidado';
    if qtd >= 40 then
      raise exception 'A lista de convidados deste jogo está cheia';
    end if;

    insert into public.players (group_id, name, skills, positions, kind, added_via_link, invited_by)
    values (gid, nome, jsonb_build_object(v_sport, 3),
            case when posicao is null then '{}'::jsonb else jsonb_build_object(v_sport, posicao) end,
            'convidado', true, p_invited_by)
    returning id into novo;
  end if;

  insert into public.attendance (event_id, player_id, status)
  values (p_event, novo, 'vou')
  on conflict (event_id, player_id) do update
    set status = 'vou',
        answered_at = case when public.attendance.status = 'vou'
                           then public.attendance.answered_at else now() end;
  return novo;
end;
$$;
revoke execute on function public.guest_upsert_convidado(uuid, uuid, text, uuid, text) from public, anon, authenticated;

-- Porta 1: o mensalista leva alguém. Só pelo link dos mensalistas, e quem
-- leva tem de ser mensalista.
create or replace function public.guest_add_player(
  code text, p_event uuid, p_name text, p_invited_by uuid default null, p_position text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from public.guest_resolve(code);
  if r.via <> 'mensalistas' then
    raise exception 'Convite inválido';
  end if;
  if p_invited_by is null or not exists (
       select 1 from public.players
        where id = p_invited_by and group_id = r.gid and active and kind = 'mensalista') then
    raise exception 'Só mensalista pode levar convidado';
  end if;
  return public.guest_upsert_convidado(r.gid, p_event, p_name, p_invited_by, p_position);
end;
$$;
revoke execute on function public.guest_add_player(text, uuid, text, uuid, text) from public;
grant  execute on function public.guest_add_player(text, uuid, text, uuid, text) to anon, authenticated;

-- Porta 2: o convidado se inscreve sozinho pelo link de convidados.
create or replace function public.guest_join(
  code text, p_event uuid, p_name text, p_position text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from public.guest_resolve(code);
  if r.via <> 'convidados' then
    raise exception 'Convite inválido';
  end if;
  return public.guest_upsert_convidado(r.gid, p_event, p_name, null, p_position);
end;
$$;
revoke execute on function public.guest_join(text, uuid, text, text) from public;
grant  execute on function public.guest_join(text, uuid, text, text) to anon, authenticated;
