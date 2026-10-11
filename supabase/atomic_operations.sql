-- Operaciones "de todo o nada" para Finia: el saldo y el movimiento se guardan JUNTOS.
-- Correr en el SQL Editor del proyecto de Finia (uwkmrkllvplmjkiiozso).
-- Es seguro volver a correrlo (reemplaza las funciones, no toca ni borra datos).
--
-- Problema que resuelve: hoy el celular hace varios pasos sueltos (anotar el
-- movimiento, restar de una cuenta, sumar a otra). Si el internet se corta a la
-- mitad, la plata sale de una cuenta y nunca llega a la otra. Con estas
-- funciones la base de datos hace todos los pasos como UNO SOLO: o se hacen
-- todos, o no se hace ninguno. Ademas los saldos se suman dentro de la base
-- (no se leen y se reescriben desde el celular), asi que dos celulares usando la
-- app a la vez ya no se pisan el saldo.
--
-- Seguridad: las funciones corren con los permisos de quien las llama (las reglas
-- RLS siguen mandando) y ademas filtran siempre por auth.uid(): nadie puede
-- tocar cuentas, movimientos ni bolsillos de otra persona.
--
-- La app ya sabe usarlas, pero si todavia no las has corrido sigue funcionando
-- con el metodo anterior. Por eso da igual el orden: corre esto cuando quieras.
--
-- El tipo de accounts.id / transactions.id / pockets.id (uuid o numerico) se
-- detecta solo, como en recurring_transactions.sql.

do $outer$
declare
  acc_t text;
  tx_t text;
  pocket_t text;
begin
  select format_type(a.atttypid, a.atttypmod) into acc_t
    from pg_attribute a where a.attrelid = 'public.accounts'::regclass and a.attname = 'id';
  select format_type(a.atttypid, a.atttypmod) into tx_t
    from pg_attribute a where a.attrelid = 'public.transactions'::regclass and a.attname = 'id';
  select format_type(a.atttypid, a.atttypmod) into pocket_t
    from pg_attribute a where a.attrelid = 'public.pockets'::regclass and a.attname = 'id';

  -- ---------------------------------------------------------------------------
  -- 1) Guardar un movimiento y ajustar el saldo de su cuenta
  -- ---------------------------------------------------------------------------
  execute format($f$
    create or replace function public.finia_add_transaction(
      p_account %1$s, p_type text, p_category text, p_title text,
      p_amount numeric, p_date date default null, p_note text default null)
    returns public.transactions
    language plpgsql
    set search_path = public
    as $fn$
    declare
      v_uid uuid := auth.uid();
      v_tx public.transactions;
    begin
      if v_uid is null then raise exception 'No hay una sesión iniciada'; end if;
      if p_type not in ('income', 'expense') then raise exception 'Tipo de movimiento inválido'; end if;
      if p_amount is null or p_amount <= 0 then raise exception 'El monto debe ser mayor que 0'; end if;

      update public.accounts
         set balance = coalesce(balance, 0) + case when p_type = 'income' then p_amount else -p_amount end
       where id = p_account and user_id = v_uid;
      if not found then raise exception 'Cuenta no encontrada'; end if;

      insert into public.transactions (user_id, account_id, type, category, title, amount, date, note)
      values (v_uid, p_account, p_type, p_category, p_title, p_amount, coalesce(p_date, current_date), p_note)
      returning * into v_tx;

      return v_tx;
    end
    $fn$$f$, acc_t);

  -- ---------------------------------------------------------------------------
  -- 2) Editar un movimiento: se revierte el efecto viejo y se aplica el nuevo
  -- ---------------------------------------------------------------------------
  execute format($f$
    create or replace function public.finia_update_transaction(
      p_id %1$s, p_account %2$s, p_type text, p_category text, p_title text,
      p_amount numeric, p_date date default null, p_note text default null)
    returns public.transactions
    language plpgsql
    set search_path = public
    as $fn$
    declare
      v_uid uuid := auth.uid();
      v_old public.transactions;
      v_new public.transactions;
    begin
      if v_uid is null then raise exception 'No hay una sesión iniciada'; end if;
      if p_type not in ('income', 'expense') then raise exception 'Tipo de movimiento inválido'; end if;
      if p_amount is null or p_amount <= 0 then raise exception 'El monto debe ser mayor que 0'; end if;

      select * into v_old from public.transactions where id = p_id and user_id = v_uid for update;
      if not found then raise exception 'No se encontró el movimiento'; end if;
      if v_old.category in ('Transferencia', 'Ahorro') then
        raise exception 'Las transferencias y depósitos a bolsillos no se pueden editar. Elimínalos y créalos de nuevo.';
      end if;

      -- 1. deshacer el efecto del movimiento viejo
      update public.accounts
         set balance = coalesce(balance, 0) + case when v_old.type = 'income' then -v_old.amount else v_old.amount end
       where id = v_old.account_id and user_id = v_uid;

      -- 2. aplicar el del nuevo (puede ser otra cuenta, otro tipo u otro monto)
      update public.accounts
         set balance = coalesce(balance, 0) + case when p_type = 'income' then p_amount else -p_amount end
       where id = p_account and user_id = v_uid;
      if not found then raise exception 'Cuenta no encontrada'; end if;

      update public.transactions
         set account_id = p_account, type = p_type, category = p_category, title = p_title,
             amount = p_amount, date = coalesce(p_date, v_old.date), note = p_note
       where id = p_id
      returning * into v_new;

      return v_new;
    end
    $fn$$f$, tx_t, acc_t);

  -- ---------------------------------------------------------------------------
  -- 3) Borrar un movimiento y devolver el saldo de su cuenta
  -- ---------------------------------------------------------------------------
  execute format($f$
    create or replace function public.finia_delete_transaction(p_id %1$s)
    returns void
    language plpgsql
    set search_path = public
    as $fn$
    declare
      v_uid uuid := auth.uid();
      v_old public.transactions;
    begin
      if v_uid is null then raise exception 'No hay una sesión iniciada'; end if;

      select * into v_old from public.transactions where id = p_id and user_id = v_uid for update;
      if not found then raise exception 'No se encontró el movimiento'; end if;

      delete from public.transactions where id = p_id;

      update public.accounts
         set balance = coalesce(balance, 0) + case when v_old.type = 'income' then -v_old.amount else v_old.amount end
       where id = v_old.account_id and user_id = v_uid;
    end
    $fn$$f$, tx_t);

  -- ---------------------------------------------------------------------------
  -- 4) Transferir entre dos cuentas tuyas (resta, suma y anota las dos puntas)
  -- ---------------------------------------------------------------------------
  execute format($f$
    create or replace function public.finia_transfer(
      p_from %1$s, p_to %1$s, p_amount numeric,
      p_note text default '', p_date date default null)
    returns void
    language plpgsql
    set search_path = public
    as $fn$
    declare
      v_uid uuid := auth.uid();
      v_date date := coalesce(p_date, current_date);
      v_found int;
    begin
      if v_uid is null then raise exception 'No hay una sesión iniciada'; end if;
      if p_from is null or p_to is null or p_from = p_to then raise exception 'Las cuentas deben ser diferentes'; end if;
      if p_amount is null or p_amount <= 0 then raise exception 'El monto debe ser mayor que 0'; end if;

      -- Se bloquean las dos cuentas (siempre en el mismo orden) para que nada mas las toque a mitad
      perform 1 from public.accounts
        where id in (p_from, p_to) and user_id = v_uid
        order by id for update;
      select count(*) into v_found from public.accounts where id in (p_from, p_to) and user_id = v_uid;
      if v_found <> 2 then raise exception 'Cuenta no encontrada'; end if;

      update public.accounts set balance = coalesce(balance, 0) - p_amount
       where id = p_from and user_id = v_uid and coalesce(balance, 0) >= p_amount;
      if not found then raise exception 'Saldo insuficiente en la cuenta de origen'; end if;

      update public.accounts set balance = coalesce(balance, 0) + p_amount
       where id = p_to and user_id = v_uid;

      insert into public.transactions (user_id, account_id, type, category, title, amount, date, note) values
        (v_uid, p_from, 'expense', 'Transferencia', 'Transferencia enviada: ' || coalesce(p_note, ''), p_amount, v_date, 'Hacia cuenta destino'),
        (v_uid, p_to,   'income',  'Transferencia', 'Transferencia recibida: ' || coalesce(p_note, ''), p_amount, v_date, 'Desde cuenta origen');
    end
    $fn$$f$, acc_t);

  -- ---------------------------------------------------------------------------
  -- 5) Depositar a un bolsillo (opcionalmente descontando de una cuenta)
  -- ---------------------------------------------------------------------------
  execute format($f$
    create or replace function public.finia_deposit_to_pocket(
      p_pocket %1$s, p_amount numeric, p_from %2$s default null, p_date date default null)
    returns void
    language plpgsql
    set search_path = public
    as $fn$
    declare
      v_uid uuid := auth.uid();
      v_name text;
    begin
      if v_uid is null then raise exception 'No hay una sesión iniciada'; end if;
      if p_amount is null or p_amount <= 0 then raise exception 'El monto debe ser mayor que 0'; end if;

      select name into v_name from public.pockets where id = p_pocket and user_id = v_uid for update;
      if not found then raise exception 'No se encontró el bolsillo'; end if;

      if p_from is not null then
        update public.accounts set balance = coalesce(balance, 0) - p_amount
         where id = p_from and user_id = v_uid and coalesce(balance, 0) >= p_amount;
        if not found then
          if exists (select 1 from public.accounts where id = p_from and user_id = v_uid) then
            raise exception 'Saldo insuficiente en la cuenta';
          end if;
          raise exception 'Cuenta no encontrada';
        end if;

        insert into public.transactions (user_id, account_id, type, category, title, amount, date, note)
        values (v_uid, p_from, 'expense', 'Ahorro', 'Ahorro para ' || coalesce(v_name, ''), p_amount,
                coalesce(p_date, current_date), 'Depósito a bolsillo');
      end if;

      update public.pockets set current_amount = coalesce(current_amount, 0) + p_amount
       where id = p_pocket and user_id = v_uid;
    end
    $fn$$f$, pocket_t, acc_t);

  -- ---------------------------------------------------------------------------
  -- Permisos: solo usuarios con sesion (nunca el publico anonimo)
  -- ---------------------------------------------------------------------------
  execute format('revoke all on function public.finia_add_transaction(%1$s, text, text, text, numeric, date, text) from public, anon', acc_t);
  execute format('grant execute on function public.finia_add_transaction(%1$s, text, text, text, numeric, date, text) to authenticated', acc_t);

  execute format('revoke all on function public.finia_update_transaction(%1$s, %2$s, text, text, text, numeric, date, text) from public, anon', tx_t, acc_t);
  execute format('grant execute on function public.finia_update_transaction(%1$s, %2$s, text, text, text, numeric, date, text) to authenticated', tx_t, acc_t);

  execute format('revoke all on function public.finia_delete_transaction(%1$s) from public, anon', tx_t);
  execute format('grant execute on function public.finia_delete_transaction(%1$s) to authenticated', tx_t);

  execute format('revoke all on function public.finia_transfer(%1$s, %1$s, numeric, text, date) from public, anon', acc_t);
  execute format('grant execute on function public.finia_transfer(%1$s, %1$s, numeric, text, date) to authenticated', acc_t);

  execute format('revoke all on function public.finia_deposit_to_pocket(%1$s, numeric, %2$s, date) from public, anon', pocket_t, acc_t);
  execute format('grant execute on function public.finia_deposit_to_pocket(%1$s, numeric, %2$s, date) to authenticated', pocket_t, acc_t);
end
$outer$;

-- Avisa a la API que hay funciones nuevas (si no, tarda un rato en verlas)
notify pgrst, 'reload schema';

-- Comprobacion (opcional): deberia listar las 5 funciones
-- select proname from pg_proc where pronamespace = 'public'::regnamespace and proname like 'finia\_%' order by 1;
