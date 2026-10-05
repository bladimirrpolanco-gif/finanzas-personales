-- Reportes de errores, sugerencias de funciones y valoraciones de Finia
-- (Perfil -> "Funciones & Errores" y "Valora Finia").
-- Correr en el SQL Editor del proyecto de Finia (uwkmrkllvplmjkiiozso).
-- Es seguro volver a correrlo (no duplica nada).
--
-- Cada usuario solo puede ENVIAR y ver SUS propios reportes. Tu los lees todos
-- desde el panel de Supabase: Table Editor -> feedback (el panel usa la llave
-- de servicio y no esta sujeto a estas politicas).

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  user_email text,
  type text not null check (type in ('bug', 'idea', 'rating')),
  rating int check (rating between 1 and 5),
  message text check (message is null or char_length(message) <= 2000),
  context jsonb,
  status text not null default 'nuevo',
  created_at timestamptz not null default now(),
  -- una valoracion necesita estrellas; un error o idea necesita texto
  constraint feedback_content check (
    (type = 'rating' and rating is not null)
    or (type <> 'rating' and message is not null and char_length(message) >= 5)
  )
);

alter table public.feedback enable row level security;

drop policy if exists "feedback: el usuario envia el suyo" on public.feedback;
create policy "feedback: el usuario envia el suyo"
  on public.feedback for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "feedback: el usuario ve el suyo" on public.feedback;
create policy "feedback: el usuario ve el suyo"
  on public.feedback for select
  to authenticated
  using (user_id = auth.uid());
