-- 035 · O WhatsApp de cada um, informado pelo link
--
-- Pedido do Guilherme em 05/10/2026: a cobrança individual abre a conversa
-- direto no número cadastrado — e o convidado que se inscrevia pelo link, ou
-- que um mensalista levava, entrava sem número nenhum.
--
--   - convidado novo se inscrevendo pelo link: informa o WhatsApp;
--   - mensalista levando alguém: pode informar o do amigo;
--   - quem já está cadastrado sem número: informa ao se identificar no link.
--
-- O link SÓ PREENCHE número de quem ainda não tem. Trocar um número existente
-- é com o administrador: senão, digitar o nome de outra pessoa bastaria para
-- desviar as cobranças e os avisos dela.
--
-- Rodar uma vez no SQL Editor, DEPOIS da 034. Não apaga dados: troca duas
-- funções do link (as versões antigas são removidas, para não haver duas com
-- o mesmo nome) e cria três.

-- Grava o número só se o jogador ainda não tiver um. Devolve se gravou
create or replace function public.preencher_whatsapp(p_player uuid, p_phone text)
returns boolean language plpgsql security definer set search_path = public as $$
declare fone text; n int;
begin
  fone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if fone = '' then
    return false;
  end if;
  if fone !~ '^[0-9]{10,13}$' then
    raise exception 'WhatsApp inválido — use DDD e número.';
  end if;
  update public.players set phone = fone, updated_at = now()
   where id = p_player and phone is null;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;
revoke execute on function public.preencher_whatsapp(uuid, text) from public, anon, authenticated;

-- ── O convidado se inscreve (030) — agora com o WhatsApp ──
drop function if exists public.guest_join(text, uuid, text, text, uuid);
create or replace function public.guest_join(
  code text, p_event uuid, p_name text, p_position text default null, p_aparelho uuid default null,
  p_phone text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r record; novo uuid;
begin
  select * into r from public.guest_resolve(code);
  if r.via not in ('convidados', 'mensalistas') then
    raise exception 'Convite inválido';
  end if;
  perform set_config('timecerto.via_link', '1', true);
  novo := public.guest_upsert_convidado(r.gid, p_event, p_name, null, p_position);
  perform public.conferir_aparelho(p_event, novo, p_aparelho);
  perform public.gravar_aparelho(p_event, novo, p_aparelho);
  perform public.preencher_whatsapp(novo, p_phone);
  perform set_config('timecerto.via_link', '', true);
  return novo;
end;
$$;

-- ── O mensalista leva alguém (030) — agora com o WhatsApp, se souber ──
drop function if exists public.guest_add_player(text, uuid, text, uuid, text, uuid);
create or replace function public.guest_add_player(
  code text, p_event uuid, p_name text, p_invited_by uuid default null, p_position text default null,
  p_aparelho uuid default null, p_phone text default null)
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
  perform public.preencher_whatsapp(novo, p_phone);
  perform set_config('timecerto.via_link', '', true);
  return novo;
end;
$$;

-- ── Pelo link: esta pessoa já tem WhatsApp? (só sim ou não, nunca o número) ──
create or replace function public.guest_tem_whatsapp(code text, p_player uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare r record;
begin
  select * into r from public.guest_resolve(code);
  return exists (select 1 from public.players
                  where id = p_player and group_id = r.gid and phone is not null
                    and (r.via = 'mensalistas' or kind = 'convidado'));
end;
$$;

-- ── Pelo link: "Cadastre seu WhatsApp" ──
create or replace function public.guest_salvar_whatsapp(code text, p_player uuid, p_phone text)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from public.guest_resolve(code);
  if not exists (select 1 from public.players
                  where id = p_player and group_id = r.gid and active and not pending
                    and (r.via = 'mensalistas' or kind = 'convidado')) then
    raise exception 'Jogador não encontrado neste grupo';
  end if;
  if regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') = '' then
    raise exception 'Informe o WhatsApp, com DDD.';
  end if;
  if not public.preencher_whatsapp(p_player, p_phone) then
    raise exception 'Este nome já tem um WhatsApp cadastrado. Para trocar, fale com o organizador.';
  end if;
end;
$$;
