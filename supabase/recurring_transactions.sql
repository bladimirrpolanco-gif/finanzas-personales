-- Movimientos recurrentes de Finia (internet, renta, sueldo...).
-- Ya aplicado en el proyecto de Finia (uwkmrkllvplmjkiiozso). Se guarda aqui
-- como documentacion; es seguro volver a correrlo (no duplica nada).
--
-- account_id toma automaticamente el mismo tipo que accounts.id (uuid o numerico).

do $$
declare acc_id_type text;
begin
  select format_type(a.atttypid, a.atttypmod) into acc_id_type
  from pg_attribute a
  where a.attrelid = 'public.accounts'::regclass and a.attname = 'id';

  execute format($f$
    create table if not exists public.recurring_transactions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
      account_id %s not null references public.accounts(id) on delete cascade,
      type text not null check (type in ('income','expense')),
      category text not null,
      title text not null,
      amount numeric(14,2) not null check (amount > 0),
      note text,
      frequency text not null check (frequency in ('weekly','monthly')),
      day_of_week int check (day_of_week between 0 and 6),
      day_of_month int check (day_of_month between 1 and 31),
      start_date date not null default current_date,
      last_generated date,
      active boolean not null default true,
      created_at timestamptz not null default now()
    )$f$, acc_id_type);
end $$;

alter table public.recurring_transactions enable row level security;

drop policy if exists "recurrentes: solo el dueño" on public.recurring_transactions;
create policy "recurrentes: solo el dueño"
  on public.recurring_transactions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
