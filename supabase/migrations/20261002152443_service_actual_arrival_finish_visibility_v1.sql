-- Las horas reales ya se guardaban, pero la mesa de Operaciones ocultaba ambas
-- columnas y list_operator_services no devolvia arrived_at para varios roles.

update public.service_module_settings
set column_visibility = coalesce(column_visibility, '{}'::jsonb)
      || '{"arrival":true,"finish":true}'::jsonb,
    updated_at = now()
where settings_key = 'default';

update public.user_view_preferences
set preferences = jsonb_set(
      jsonb_set(coalesce(preferences, '{}'::jsonb), '{column_visibility,arrival}', 'true'::jsonb, true),
      '{column_visibility,finish}', 'true'::jsonb, true
    ),
    updated_at = now()
where view_key = 'operator_services_table_v2';

do $migration$
declare
  v_definition text := pg_get_functiondef('public.list_operator_services(integer)'::regprocedure);
  v_updated text;
begin
  v_updated := replace(
    v_definition,
    '''estimated_finish_at'',s.estimated_finish_at,',
    '''estimated_finish_at'',s.estimated_finish_at,''arrived_at'',s.arrived_at,'
  );

  if v_updated = v_definition then
    raise exception 'list_operator_services: no se encontro el punto para agregar arrived_at';
  end if;

  execute v_updated;
end;
$migration$;
