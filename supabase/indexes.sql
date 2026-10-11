-- Indices para que Finia siga rapida cuando haya mucha gente y muchos movimientos.
-- Correr en el SQL Editor del proyecto de Finia (uwkmrkllvplmjkiiozso).
-- Es seguro volver a correrlo (no duplica nada) y no borra ni cambia datos.
--
-- Por que: cada consulta de la app filtra por usuario (las reglas de seguridad
-- RLS comparan user_id = auth.uid()) y casi siempre por fecha. Sin indice, la
-- base lee TODA la tabla de TODOS los usuarios para cada pantalla; con 20
-- movimientos no se nota, con decenas de miles si.

-- Movimientos: por usuario y fecha (listas, calendario, informe, graficas)
create index if not exists transactions_user_date_idx
  on public.transactions (user_id, date desc);

-- Cuentas y bolsillos: siempre se piden por usuario
create index if not exists accounts_user_idx
  on public.accounts (user_id);

create index if not exists pockets_user_idx
  on public.pockets (user_id);

-- Gastos recurrentes (los revisa la app al abrirse)
create index if not exists recurring_transactions_user_idx
  on public.recurring_transactions (user_id);

-- Reportes de errores/sugerencias: tu los lees por fecha en el panel
create index if not exists feedback_created_idx
  on public.feedback (created_at desc);

-- Comprobacion (opcional): deberia listar los indices de arriba
-- select tablename, indexname from pg_indexes
--  where schemaname = 'public' and indexname like any (array[
--    'transactions_user_date_idx','accounts_user_idx','pockets_user_idx',
--    'recurring_transactions_user_idx','feedback_created_idx']);
