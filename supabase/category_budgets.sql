-- Presupuesto mensual por categoria de gasto (ej. Comida: 8,000).
-- Correr en el SQL Editor del proyecto de Finia (uwkmrkllvplmjkiiozso).
-- Es seguro volver a correrlo (no duplica nada).
--
-- `category` es el mismo texto que se guarda en transactions.category: el id
-- de una categoria estandar ('food', 'transport'...) o el nombre propio que el
-- usuario escribio en "Otros".

create table if not exists public.category_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category text not null,
  monthly_amount numeric(14,2) not null check (monthly_amount > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category)
);

alter table public.category_budgets enable row level security;

drop policy if exists "presupuesto por categoria: solo el dueño" on public.category_budgets;
create policy "presupuesto por categoria: solo el dueño"
  on public.category_budgets for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
