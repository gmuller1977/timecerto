-- 030 · Um link só, com o nome travado no celular
--
-- Pedido do Guilherme em 04/10/2026. A maioria dos grupos tem um grupo de
-- WhatsApp só, o dos mensalistas — então o link dos mensalistas vira o link do
-- jogo: o mensalista procura o nome e confirma, e quem não é mensalista se
-- inscreve como convidado ali mesmo (o mensalista manda o link para o amigo, ou
-- leva o amigo ele mesmo, como já fazia). O link dos convidados continua vivo.
--
-- O risco de um link só é o convidado ver os nomes dos mensalistas e, com a
-- promoção, ter motivo para confirmar no nome de quem ainda não respondeu. A
-- trava:
--
--   - em cada jogo, o PRIMEIRO celular que responde por um nome passa a ser o
--     único que muda a resposta daquele nome (attendance.aparelho, um número
--     aleatório que o app guarda no celular). No jogo seguinte começa do zero;
--   - quem foi chamado da lista de espera confirma de qualquer celular: o
--     chamado é do organizador, numa mensagem direta;
--   - o organizador sempre pode mudar, e quando ele muda a resposta (ou a fila
--     anda sozinha), a trava se solta — é a saída de quem ficou de fora.
--
-- Não pega quem chega primeiro no nome de outro; pega o resto, e o que sobra a
-- lista pública mostra: o mensalista que não confirmou e aparece como "vou"
-- percebe, e ao tentar responder vê que o nome dele foi usado.
--
-- Rodar uma vez no SQL Editor, DEPOIS da 029. Não apaga dados: cria uma
-- coluna, um gatilho, e troca três funções do link (as versões antigas, sem o
-- celular, são removidas para não haver duas com o mesmo nome).

alter table public.attendance add column if not exists aparelho uuid;

-- As funções do link avisam que a escrita é delas; qualquer outra mudança de
-- resposta (organizador, fila de espera) solta a trava
create or replace function public.attendance_soltar_trava()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status is distinct from old.status
     and coalesce(current_setting('timecerto.via_link', true), '') <> '1' then
    new.aparelho := null;
  end if;
  return new;
end;
$$;
drop trigger if exists attendance_soltar_trava on public.attendance;
create trigger attendance_soltar_trava
  before update on public.attendance
  for each row execute function public.attendance_soltar_trava();

-- O nome já respondido por outro celular, neste jogo? Recusa; senão, o nome
-- fica com este celular
create or replace function public.conferir_aparelho(p_event uuid, p_player uuid, p_aparelho uuid)
returns void language plpgsql security definer set search_path = public as $$
declare dono uuid; atual text;
begin
  select aparelho, status into dono, atual from public.attendance
   where event_id = p_event and player_id = p_player;
  if dono is not null and dono is distinct from p_aparelho and atual is distinct from 'chamado' then
    raise exception 'Este nome já foi respondido de outro celular neste jogo. Responda por ele, ou peça ao organizador para mudar.';
  end if;
end;
$$;
revoke execute on function public.conferir_aparelho(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.gravar_aparelho(p_event uuid, p_player uuid, p_aparelho uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_aparelho is null then
    return;
  end if;
  update public.attendance set aparelho = p_aparelho
   where event_id = p_event and player_id = p_player and aparelho is distinct from p_aparelho;
end;
$$;
revoke execute on function public.gravar_aparelho(uuid, uuid, uuid) from public, anon, authenticated;

-- ── Responder ──
drop function if exists public.guest_set_attendance(text, uuid, uuid, text);
create or replace function public.guest_set_attendance(
  code text, p_event uuid, p_player uuid, p_status text, p_aparelho uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare r record; fechada boolean; atual text; novo text;
begin
  if p_status not in ('vou', 'nao_vou') then
    raise exception 'Resposta inválida';
  end if;
  select * into r from public.guest_resolve(code);
  select list_closed into fechada from public.events
   where id = p_event and group_id = r.gid and not closed;
  if fechada is null then
    raise exception 'Este jogo não aceita mais respostas';
  end if;
  if not exists (select 1 from public.players
                  where id = p_player and group_id = r.gid and active and not pending
                    and (r.via = 'mensalistas' or kind = 'convidado')) then
    raise exception 'Jogador não encontrado neste grupo';
  end if;
  perform public.conferir_aparelho(p_event, p_player, p_aparelho);
  perform set_config('timecerto.via_link', '1', true);

  select status into atual from public.attendance
   where event_id = p_event and player_id = p_player;

  if not fechada then
    novo := p_status;
  elsif p_status = 'nao_vou' then
    novo := 'nao_vou';
  elsif atual = 'chamado' then
    novo := 'vou';
  elsif atual in ('vou', 'espera') then
    perform public.gravar_aparelho(p_event, p_player, p_aparelho);
    perform set_config('timecerto.via_link', '', true);
    return;
  else
    novo := 'espera';
  end if;

  insert into public.attendance (event_id, player_id, status, espera_desde, aparelho)
  values (p_event, p_player, novo, case when novo = 'espera' then now() end, p_aparelho)
  on conflict (event_id, player_id) do update
    set status = excluded.status,
        espera_desde = case when excluded.status = 'espera' then now()
                            else public.attendance.espera_desde end,
        answered_at = case when public.attendance.status = excluded.status
                           then public.attendance.answered_at else now() end,
        aparelho = coalesce(excluded.aparelho, public.attendance.aparelho);
  perform set_config('timecerto.via_link', '', true);
end;
$$;

-- ── O convidado se inscreve: agora também pelo link dos mensalistas ──
drop function if exists public.guest_join(text, uuid, text, text);
create or replace function public.guest_join(
  code text, p_event uuid, p_name text, p_position text default null, p_aparelho uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r record; novo uuid;
begin
  select * into r from public.guest_resolve(code);
  if r.via not in ('convidados', 'mensalistas') then
    raise exception 'Convite inválido';
  end if;
  perform set_config('timecerto.via_link', '1', true);
  novo := public.guest_upsert_convidado(r.gid, p_event, p_name, null, p_position);
  -- Nome de convidado que já existe: a mesma trava de responder por ele
  perform public.conferir_aparelho(p_event, novo, p_aparelho);
  perform public.gravar_aparelho(p_event, novo, p_aparelho);
  perform set_config('timecerto.via_link', '', true);
  return novo;
end;
$$;

-- ── O mensalista leva alguém ──
drop function if exists public.guest_add_player(text, uuid, text, uuid, text);
create or replace function public.guest_add_player(
  code text, p_event uuid, p_name text, p_invited_by uuid default null, p_position text default null,
  p_aparelho uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r record; novo uuid;
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
  perform set_config('timecerto.via_link', '1', true);
  novo := public.guest_upsert_convidado(r.gid, p_event, p_name, p_invited_by, p_position);
  perform public.conferir_aparelho(p_event, novo, p_aparelho);
  perform public.gravar_aparelho(p_event, novo, p_aparelho);
  perform set_config('timecerto.via_link', '', true);
  return novo;
end;
$$;
