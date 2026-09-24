-- ─────────────────────────────────────────────────────────────
-- 010 — Atletas únicos em todos os aparelhos (fase 1 da base única)
--
-- Até aqui cada aparelho era a fonte da verdade do elenco e a nuvem guardava
-- uma cópia. Agora a nuvem é a base comum: cada aparelho envia o que editou
-- e traz o que os outros editaram.
--
-- Duas horas por jogador, com papéis diferentes:
--   updated_at — quando a EDIÇÃO foi feita, no aparelho. Decide quem vence.
--   synced_at  — quando a linha CHEGOU ao servidor. Carimbada aqui, pelo
--                banco; é por ela que cada aparelho pergunta "o que mudou
--                desde a última vez". Separar as duas é o que impede um
--                aparelho de relógio atrasado de perder mudanças.
--
-- Excluir vira marca (deleted_at), que viaja para os outros aparelhos. O
-- mecanismo antigo — desativar na nuvem quem não está no aparelho — sai: ele
-- deixava um segundo aparelho com elenco diferente apagar os links.
--
-- Rodar uma vez no SQL Editor, DEPOIS da 009. Não apaga dados: acrescenta
-- três colunas, um gatilho e uma função.
-- ─────────────────────────────────────────────────────────────

alter table public.players
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists synced_at  timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create index if not exists players_sync_idx on public.players (group_id, synced_at);

-- Toda gravação — do organizador, dos links, de qualquer função — carimba a
-- hora de chegada. É o que garante que nenhuma mudança escapa da leitura.
create or replace function public.players_carimbar_chegada()
returns trigger language plpgsql set search_path = public as $$
begin
  new.synced_at := now();
  return new;
end;
$$;

drop trigger if exists players_synced_at on public.players;
create trigger players_synced_at
  before insert or update on public.players
  for each row execute function public.players_carimbar_chegada();

-- Grava um lote de jogadores do organizador. Vale a edição mais recente:
-- a linha só é sobrescrita se a que chega tem updated_at MAIOR. Um aparelho
-- desatualizado não atropela o que outro gravou depois.
--
-- security invoker: roda com as permissões de quem chama, então a RLS de
-- `players` vale inteira — só o dono/organizador do grupo grava.
create or replace function public.salvar_jogadores(p_group uuid, p_rows jsonb)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not public.can_manage_group(p_group) then
    raise exception 'Sem permissão neste grupo';
  end if;

  insert into public.players as p
    (id, group_id, name, nickname, skills, positions, is_keeper, kind, pending,
     birth_date, phone, active, deleted_at, updated_at)
  select r.id, p_group, r.name, r.nickname,
         coalesce(r.skills, '{}'::jsonb), coalesce(r.positions, '{}'::jsonb),
         coalesce(r.is_keeper, false), coalesce(r.kind, 'mensalista'),
         coalesce(r.pending, false), r.birth_date, r.phone,
         r.deleted_at is null, r.deleted_at, r.updated_at
    from jsonb_to_recordset(p_rows) as r(
           id uuid, name text, nickname text, skills jsonb, positions jsonb,
           is_keeper boolean, kind text, pending boolean, birth_date date,
           phone text, deleted_at timestamptz, updated_at timestamptz)
  on conflict (id) do update set
    name       = excluded.name,
    nickname   = excluded.nickname,
    skills     = excluded.skills,
    positions  = excluded.positions,
    is_keeper  = excluded.is_keeper,
    kind       = excluded.kind,
    pending    = excluded.pending,
    birth_date = excluded.birth_date,
    phone      = excluded.phone,
    active     = excluded.active,
    deleted_at = excluded.deleted_at,
    updated_at = excluded.updated_at
  where p.group_id = p_group
    and p.updated_at < excluded.updated_at;
end;
$$;

revoke execute on function public.salvar_jogadores(uuid, jsonb) from public, anon;
grant  execute on function public.salvar_jogadores(uuid, jsonb) to authenticated;
