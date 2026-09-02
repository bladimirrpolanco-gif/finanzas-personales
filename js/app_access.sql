-- Access control for Finia
-- Run this in the Supabase SQL editor for the project you want to use.

create table if not exists public.app_access (
    user_id uuid primary key references auth.users(id) on delete cascade,
    email text not null unique,
    enabled boolean not null default true,
    created_at timestamptz not null default now()
);

alter table public.app_access enable row level security;

drop policy if exists "Users can read own access row" on public.app_access;
create policy "Users can read own access row"
on public.app_access
for select
to authenticated
using ((select auth.uid()) = user_id);

-- Optional: if you want the app to create a profile row automatically
-- when the auth user exists, keep your existing profiles table logic as-is.
-- Add rows to public.app_access manually from the SQL editor:
--
-- insert into public.app_access (user_id, email, enabled)
-- values ('00000000-0000-0000-0000-000000000000', 'user@example.com', true);
