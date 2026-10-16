-- Eliminar una cuenta (y sus movimientos) como UNA sola operacion de todo o nada.
-- Correr en el SQL Editor del proyecto de Finia (uwkmrkllvplmjkiiozso).
-- Es seguro volver a correrlo (reemplaza la funcion, no toca ni borra datos).
--
-- Que hace: borra los movimientos de la cuenta y luego la cuenta. Sus gastos
-- recurrentes se borran solos (recurring_transactions.account_id tiene
-- "on delete cascade"). Si algo falla a la mitad no se borra nada.
-- Los bolsillos no se tocan. Si la cuenta hizo transferencias con otra cuenta tuya,
-- la otra cuenta conserva su lado del movimiento.
--
-- Seguridad: corre con los permisos de quien la llama (RLS manda) y solo toca
-- cuentas de auth.uid(). Sin sesion no se puede ejecutar.
--
-- La app ya sabe usarla, pero si todavia no la has corrido sigue funcionando con
-- el metodo anterior (borra los movimientos y luego la cuenta, en dos pasos).

do $outer$
declare
  acc_t text;
begin
  select format_type(a.atttypid, a.atttypmod) into acc_t
    from pg_attribute a where a.attrelid = 'public.accounts'::regclass and a.attname = 'id';

  execute format($f$
    create or replace function public.finia_delete_account(p_id %1$s)
    returns void
    language plpgsql
    set search_path = public
    as $fn$
    declare
      v_uid uuid := auth.uid();
    begin
      if v_uid is null then raise exception 'No hay una sesión iniciada'; end if;

      perform 1 from public.accounts where id = p_id and user_id = v_uid for update;
      if not found then raise exception 'Cuenta no encontrada'; end if;

      delete from public.transactions where account_id = p_id and user_id = v_uid;
      delete from public.accounts where id = p_id and user_id = v_uid;
    end
    $fn$$f$, acc_t);

  execute format('revoke all on function public.finia_delete_account(%1$s) from public, anon', acc_t);
  execute format('grant execute on function public.finia_delete_account(%1$s) to authenticated', acc_t);
end
$outer$;

notify pgrst, 'reload schema';
