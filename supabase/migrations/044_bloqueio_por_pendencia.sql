-- 044 · Quem está com pagamento em atraso não entra na lista pelo link
--
-- Pedido do Guilherme em 16/11/2026 (tela aprovada no mesmo dia). Inverte duas
-- decisões antigas: "dívida não impede confirmar" (019) e "o link não mostra
-- itens nem valores" (033). Agora:
--
-- • Quem tem cobrança VENCIDA não coloca o nome na lista pelo link (vou,
--   fila, espera, aceitar a vaga do chamado). "Não vou" continua liberado.
--   Quem já está na lista não sai por isso.
-- • Vencida: mensalidade e avulsa no dia seguinte ao vencimento; a diária do
--   jogo tem N dias depois do jogo, configurável em Ajustes
--   (groups.diaria_prazo_dias, padrão 3 — pedido do Guilherme).
-- • "Já paguei" pelo link vale só para cobrança EM DIA. Atrasada não libera
--   pelo link: a pessoa fala com o administrador, que confere e dá baixa.
-- • O link mostra motivo, data e valor de cada pendência atrasada, o total, o
--   Pix com o valor e o botão "Falar com o administrador" (WhatsApp salvo em
--   Ajustes). Quem tem o link e toca no nome de outra pessoa vê o que ela deve:
--   aceito pelo Guilherme ao aprovar a tela.
-- • O bloqueio é no BANCO (funções guest_*), não só na tela. O administrador
--   continua confirmando qualquer pessoa pelo app.
-- • Interruptor por grupo em Ajustes (groups.bloquear_devedor), ligado.
--
-- Rodar uma vez no SQL Editor, DEPOIS da 043. Não apaga dados: cria quatro
-- colunas em groups (sem tabela nova, então sem GRANT novo) e recria funções
-- com a mesma assinatura (os grants delas continuam).

alter table public.groups
  add column if not exists bloquear_devedor boolean not null default true,
  add column if not exists admin_whatsapp text
    check (admin_whatsapp is null or admin_whatsapp ~ '^[0-9]{10,13}$'),
  add column if not exists admin_nome text
    check (admin_nome is null or length(admin_nome) between 1 and 40),
  add column if not exists diaria_prazo_dias int not null default 3
    check (diaria_prazo_dias between 0 and 30);

-- ── Vencimento efetivo: a diária tem o prazo do grupo depois do jogo ──
create or replace function public.vencimento_efetivo(p_tipo text, p_vence date, p_prazo int)
returns date language sql immutable as $$
  select case when p_tipo = 'diaria' then p_vence + coalesce(p_prazo, 3) else p_vence end;
$$;
revoke execute on function public.vencimento_efetivo(text, date, int) from public, anon, authenticated;

-- ── As pendências ATRASADAS de um jogador (o que falta de cada uma) ──
create or replace function public.pendencias_atrasadas(gid uuid, p_player uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'tipo', x ->> 'tipo',
           'descricao', x ->> 'descricao',
           'venceEm', public.vencimento_efetivo(x ->> 'tipo', (x ->> 'venceEm')::date, g.diaria_prazo_dias),
           'faltaCents', (x ->> 'faltaCents')::int)
         order by (x ->> 'venceEm')), '[]'::jsonb)
    from public.groups g,
         jsonb_array_elements(public.pendencias_do_jogador(gid, p_player)) x
   where g.id = gid
     and public.vencimento_efetivo(x ->> 'tipo', (x ->> 'venceEm')::date, g.diaria_prazo_dias)
         < (now() at time zone 'America/Sao_Paulo')::date;
$$;
revoke execute on function public.pendencias_atrasadas(uuid, uuid) from public, anon, authenticated;

-- ── Trava: recusa quem está em atraso, se o grupo bloqueia ──
create or replace function public.conferir_pendencia(gid uuid, p_player uuid, p_outro boolean default false)
returns void language plpgsql stable security definer set search_path = public as $$
declare nome text;
begin
  if not coalesce((select bloquear_devedor from public.groups where id = gid), false) then
    return;
  end if;
  if jsonb_array_length(public.pendencias_atrasadas(gid, p_player)) = 0 then
    return;
  end if;
  if p_outro then
    select coalesce(nullif(nickname, ''), name) into nome from public.players where id = p_player;
    raise exception '% está com pagamento em atraso e não pode entrar na lista. Fale com o administrador do grupo.', nome;
  end if;
  raise exception 'Você está com pagamento em atraso. Acerte a pendência antes de colocar o nome na lista do jogo.';
end;
$$;
revoke execute on function public.conferir_pendencia(uuid, uuid, boolean) from public, anon, authenticated;

-- ── Pelo link: estou bloqueado? com o quê? ──
create or replace function public.guest_bloqueio(code text, p_player uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r record; g public.groups; itens jsonb;
begin
  select * into r from public.guest_resolve(code);
  if not exists (select 1 from public.players
                  where id = p_player and group_id = r.gid and active and not pending
                    and deleted_at is null
                    and (r.via = 'mensalistas' or kind = 'convidado')) then
    raise exception 'Jogador não encontrado neste grupo';
  end if;
  select * into g from public.groups where id = r.gid;
  itens := case when g.bloquear_devedor then public.pendencias_atrasadas(r.gid, p_player) else '[]'::jsonb end;
  if jsonb_array_length(itens) = 0 then
    return jsonb_build_object('bloqueado', false);
  end if;
  return jsonb_build_object(
    'bloqueado', true,
    'itens', itens,
    'totalCents', (select sum((x ->> 'faltaCents')::int) from jsonb_array_elements(itens) x),
    'admin', jsonb_build_object('nome', g.admin_nome, 'whatsapp', g.admin_whatsapp),
    'pix', jsonb_build_object('chave', g.pix_chave, 'nome', g.pix_nome, 'cidade', g.pix_cidade));
end;
$$;
revoke execute on function public.guest_bloqueio(text, uuid) from public;
grant  execute on function public.guest_bloqueio(text, uuid) to anon, authenticated;

-- ── Pelo link: o contato do administrador (aba Pagamento, atraso) ──
create or replace function public.guest_contato_admin(code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r record;
begin
  select * into r from public.guest_resolve(code);
  return (select jsonb_build_object('nome', admin_nome, 'whatsapp', admin_whatsapp)
            from public.groups where id = r.gid);
end;
$$;
revoke execute on function public.guest_contato_admin(text) from public;
grant  execute on function public.guest_contato_admin(text) to anon, authenticated;

-- ── 033 com o atraso: "Já paguei" só para o que está em dia ──
create or replace function public.guest_pendencias(code text, p_player uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r record; abertas jsonb; em_dia jsonb; hoje date; prazo int;
begin
  select * into r from public.guest_resolve(code);
  if not exists (select 1 from public.players
                  where id = p_player and group_id = r.gid and active and not pending
                    and deleted_at is null
                    and (r.via = 'mensalistas' or kind = 'convidado')) then
    raise exception 'Jogador não encontrado neste grupo';
  end if;
  hoje := (now() at time zone 'America/Sao_Paulo')::date;
  select diaria_prazo_dias into prazo from public.groups where id = r.gid;
  abertas := public.pendencias_do_jogador(r.gid, p_player);
  select coalesce(jsonb_agg(x), '[]'::jsonb) into em_dia
    from jsonb_array_elements(abertas) x
   where public.vencimento_efetivo(x ->> 'tipo', (x ->> 'venceEm')::date, prazo) >= hoje;
  return jsonb_build_object(
    'emAberto', jsonb_array_length(abertas) > 0,
    'atrasado', jsonb_array_length(abertas) > jsonb_array_length(em_dia),
    'emDia', jsonb_array_length(em_dia) > 0,
    -- Confirmado = tudo o que está em dia já foi informado
    'confirmado', jsonb_array_length(em_dia) > 0
                  and not exists (select 1 from jsonb_array_elements(em_dia) x
                                   where x ->> 'informadoEm' is null));
end;
$$;

create or replace function public.guest_informar_pendencias(code text, p_player uuid)
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int; hoje date; prazo int;
begin
  select * into r from public.guest_resolve(code);
  if not exists (select 1 from public.players
                  where id = p_player and group_id = r.gid and active and not pending
                    and deleted_at is null
                    and (r.via = 'mensalistas' or kind = 'convidado')) then
    raise exception 'Jogador não encontrado neste grupo';
  end if;
  hoje := (now() at time zone 'America/Sao_Paulo')::date;
  select diaria_prazo_dias into prazo from public.groups where id = r.gid;
  update public.cobrancas c set informado_em = now()
   where c.informado_em is null
     and public.vencimento_efetivo(c.tipo, c.vence_em, prazo) >= hoje
     and c.id in (select (x ->> 'id')::uuid
                    from jsonb_array_elements(public.pendencias_do_jogador(r.gid, p_player)) x);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ── 030 com a trava: responder "vou" pelo link ──
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

  select status into atual from public.attendance
   where event_id = p_event and player_id = p_player;

  -- Quem já está na lista não sai por dívida; entrar (ou aceitar a vaga) trava
  if p_status = 'vou' and coalesce(atual, '') not in ('vou', 'espera') then
    perform public.conferir_pendencia(r.gid, p_player);
  end if;

  perform set_config('timecerto.via_link', '1', true);

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

-- ── 035 com a trava: o convidado se inscreve ──
-- Nome novo não deve nada; quem volta com o mesmo nome é a mesma pessoa e
-- passa pela trava. Se recusar, a transação inteira volta.
create or replace function public.guest_join(
  code text, p_event uuid, p_name text, p_position text default null, p_aparelho uuid default null,
  p_phone text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r record; novo uuid; ja_estava boolean;
begin
  select * into r from public.guest_resolve(code);
  if r.via not in ('convidados', 'mensalistas') then
    raise exception 'Convite inválido';
  end if;
  select exists (select 1 from public.attendance a join public.players p on p.id = a.player_id
                  where a.event_id = p_event and p.group_id = r.gid and p.active
                    and lower(p.name) = lower(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')))
                    and a.status in ('vou', 'chamado', 'espera'))
    into ja_estava;
  perform set_config('timecerto.via_link', '1', true);
  novo := public.guest_upsert_convidado(r.gid, p_event, p_name, null, p_position);
  if not ja_estava then
    perform public.conferir_pendencia(r.gid, novo);
  end if;
  perform public.conferir_aparelho(p_event, novo, p_aparelho);
  perform public.gravar_aparelho(p_event, novo, p_aparelho);
  perform public.preencher_whatsapp(novo, p_phone);
  perform set_config('timecerto.via_link', '', true);
  return novo;
end;
$$;

-- ── 035 com a trava: o mensalista leva alguém que está em atraso ──
create or replace function public.guest_add_player(
  code text, p_event uuid, p_name text, p_invited_by uuid default null, p_position text default null,
  p_aparelho uuid default null, p_phone text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r record; novo uuid; ja_estava boolean;
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
  select exists (select 1 from public.attendance a join public.players p on p.id = a.player_id
                  where a.event_id = p_event and p.group_id = r.gid and p.active
                    and lower(p.name) = lower(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')))
                    and a.status in ('vou', 'chamado', 'espera'))
    into ja_estava;
  perform set_config('timecerto.via_link', '1', true);
  novo := public.guest_upsert_convidado(r.gid, p_event, p_name, p_invited_by, p_position);
  if not ja_estava then
    perform public.conferir_pendencia(r.gid, novo, true);
  end if;
  perform public.conferir_aparelho(p_event, novo, p_aparelho);
  perform public.gravar_aparelho(p_event, novo, p_aparelho);
  perform public.preencher_whatsapp(novo, p_phone);
  perform set_config('timecerto.via_link', '', true);
  return novo;
end;
$$;
