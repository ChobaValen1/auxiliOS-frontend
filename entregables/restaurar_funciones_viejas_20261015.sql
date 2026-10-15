-- Restaurar las 67 funciones borradas el 15/10/2026, desde la copia guardada
-- en app_private.function_backup_20261015 (con sus permisos).
-- Solo hace falta si algo dejó de andar. Correr entero en el SQL Editor.
begin;
set local search_path = public;
do $$ declare r record; begin
  for r in select definition, grants from app_private.function_backup_20261015 order by signature loop
    execute r.definition;
    execute r.grants;
  end loop;
end $$;
-- Control: tiene que dar 67
select count(*) restauradas from app_private.function_backup_20261015 b
where to_regprocedure('public.'||b.signature) is not null;
commit;
