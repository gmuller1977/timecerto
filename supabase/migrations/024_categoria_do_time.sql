-- 024 · Categoria e naipe do time
--
-- Pedido do Guilherme em 30/09/2026: ao criar um grupo profissional, já
-- definir a categoria e o naipe do time. Todo atleta novo nasce com eles,
-- e o técnico não repete a informação a cada cadastro — continua podendo
-- trocar na ficha (a atleta sub-15 que joga no sub-17).
--
-- É do GRUPO, e não do aparelho: todos os administradores veem o mesmo. Na
-- pelada fica nulo. Quem edita é quem já edita o grupo (groups_manage).

alter table public.groups
  add column if not exists age_group text
    check (age_group in ('sub13', 'sub15', 'sub17', 'sub19', 'sub21', 'adulto', 'master')),
  add column if not exists naipe text
    check (naipe in ('masculino', 'feminino', 'misto'));
