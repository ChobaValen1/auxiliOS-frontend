-- Borrar las 67 funciones viejas que no usa nadie · 15/10/2026
-- Antes de borrar, ya quedó una copia completa (definición + permisos) en
-- app_private.function_backup_20261015. Para volver atrás: restaurar_funciones_viejas_20261015.sql
--
-- Correr UNA sola vez, entero, en el SQL Editor de Supabase.
-- Si cualquier paso falla, no se borra nada.
begin;
set local lock_timeout = '5s';

-- Seguro 1: la copia tiene las 67 funciones completas
do $$ begin
  if (select count(*) from app_private.function_backup_20261015
      where definition like 'CREATE OR REPLACE FUNCTION%' and grants <> '') <> 67 then
    raise exception 'La copia de seguridad no está completa: no se borra nada';
  end if;
end $$;

-- Borrar exactamente las funciones de la copia (sin CASCADE: si algo dependiera
-- de una de ellas, la base frena el borrado y no se toca nada)
do $$ declare r record; begin
  for r in select signature from app_private.function_backup_20261015 order by signature loop
    execute format('drop function public.%s', r.signature);
  end loop;
end $$;

-- Seguro 2: las funciones que usa la app siguen ahí
do $$ begin
  if to_regprocedure('public.get_driver_operator_queue_v4()') is null
     or to_regprocedure('public.get_driver_operator_queue_v2()') is null
     or to_regprocedure('public.list_operator_services(integer)') is null
     or to_regprocedure('public.update_operator_service_v4(uuid,jsonb,text)') is null
     or to_regprocedure('public.create_operator_service_v4(jsonb)') is null
     or to_regprocedure('public.calcular_efectivo_jornada(integer)') is null
     or to_regprocedure('public.calcular_gastos_jornada(integer)') is null then
    raise exception 'Falta una función que usa la app: no se borra nada';
  end if;
end $$;

-- Control: tiene que dar 194 funciones y 0 de las viejas
select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public') funciones,
       (select count(*) from app_private.function_backup_20261015 b where to_regprocedure('public.'||b.signature) is not null) viejas_que_quedan;
commit;
