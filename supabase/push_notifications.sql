-- Notificaciones push de Finia.
-- Correr en el SQL Editor del proyecto de Finia (uwkmrkllvplmjkiiozso).
-- PARTE 1 (tablas) se puede correr ya. PARTE 2 (horario diario) se corre DESPUES
-- de desplegar la funcion send-push y definir el CRON_SECRET (ver
-- supabase/functions/send-push/index.ts, al inicio).

-- =====================  PARTE 1: TABLAS  =====================

-- Un dispositivo suscrito = una fila (endpoint unico del navegador/celular).
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push: solo el dueño" on public.push_subscriptions;
create policy "push: solo el dueño"
  on public.push_subscriptions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Avisos ya enviados, para no repetir el mismo (ej. "80% del presupuesto de
-- octubre"). Solo la funcion del servidor (service role) lee y escribe aqui:
-- RLS activado SIN politicas = ningun usuario puede tocarla desde la app.
create table if not exists public.push_alert_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  alert_key text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, alert_key)
);

alter table public.push_alert_log enable row level security;

-- =====================  PARTE 2: HORARIO DIARIO  =====================
-- Descomenta y corre DESPUES de desplegar la funcion. Cambia TU_CRON_SECRET por
-- el mismo texto que pusiste en el secreto CRON_SECRET de la funcion, y
-- TU_ANON_KEY por la "anon public" key (Settings -> API) -- la misma que ya
-- usa la app en js/supabase-client.js.
--
-- Corre todos los dias a las 12:00 UTC = 8:00 a.m. en Republica Dominicana.
--
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
--
-- select cron.schedule(
--   'finia-daily-push',
--   '0 12 * * *',
--   $$
--   select net.http_post(
--     url := 'https://uwkmrkllvplmjkiiozso.supabase.co/functions/v1/send-push',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer TU_ANON_KEY',
--       'x-cron-secret', 'TU_CRON_SECRET'
--     ),
--     body := '{"mode":"daily"}'::jsonb
--   );
--   $$
-- );
--
-- Para quitarlo: select cron.unschedule('finia-daily-push');
