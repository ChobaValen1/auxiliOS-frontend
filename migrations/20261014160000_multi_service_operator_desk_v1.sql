-- Varios servicios a la vez · etapa 2 (mesa del operador).
-- Le da a la pantalla de Servicios lo que necesita para mostrar la cola del
-- chofer y no frenar la asignación de un chofer con el interruptor encendido.
-- Para los choferes sin interruptor no cambia nada: solo se agregan campos.
do $p$
declare d text; n text;
begin
  -- 1) Lista de Servicios: lugar en la cola, si ya empezó y si el chofer usa la cola
  d := pg_get_functiondef('public.list_operator_services(integer)'::regprocedure);
  n := replace(d,
    E'''driver_name'',du.full_name,''truck_label'',coalesce(t.numero_interno,t.plate),\r\n        ''estimated_distance_km'',s.estimated_distance_km,',
    E'''driver_name'',du.full_name,''truck_label'',coalesce(t.numero_interno,t.plate),\r\n        ''driver_queue_position'',s.driver_queue_position,''trip_started'',s.trip_id is not null,\r\n        ''driver_multi_service'',app_private.multi_service_enabled_v1(s.assigned_driver_id),\r\n        ''estimated_distance_km'',s.estimated_distance_km,');
  n := replace(n,
    E'''driver_name'',du.full_name,\r\n          ''truck_label'',coalesce(t.numero_interno,t.plate),',
    E'''driver_name'',du.full_name,\r\n          ''trip_started'',s.trip_id is not null,\r\n          ''driver_multi_service'',app_private.multi_service_enabled_v1(s.assigned_driver_id),\r\n          ''truck_label'',coalesce(t.numero_interno,t.plate),');
  if (length(n) - length(d)) < 300 then raise exception 'parche cola: list_operator_services'; end if;
  execute n;

  -- 2) Disponibilidad de choferes y móviles para asignar
  d := pg_get_functiondef('public.get_operator_resource_availability()'::regprocedure);
  n := replace(d,
    E'        ''active_service_number'', a.service_number,\n        ''active_service_status'', a.status,\n        ''resource_state'', case\n          when not coalesce(u.is_active, true) then ''inactive''',
    E'        ''active_service_number'', a.service_number,\n        ''active_service_status'', a.status,\n        ''multi_service'', app_private.multi_service_enabled_v1(u.user_id),\n        ''resource_state'', case\n          when not coalesce(u.is_active, true) then ''inactive''');
  n := replace(n,
    E'        select distinct on (s.assigned_truck_id)\n          s.assigned_truck_id,\n          s.service_number,',
    E'        select distinct on (s.assigned_truck_id)\n          s.assigned_truck_id,\n          s.assigned_driver_id,\n          s.service_number,');
  n := replace(n,
    E'        ''active_service_number'', a.service_number,\n        ''active_service_status'', a.status,\n        ''resource_state'', case\n          when coalesce(t.status, ''inactive'') <> ''active'' then ''inactive''',
    E'        ''active_service_number'', a.service_number,\n        ''active_service_status'', a.status,\n        ''active_service_driver_id'', a.assigned_driver_id,\n        ''active_service_multi'', app_private.multi_service_enabled_v1(a.assigned_driver_id),\n        ''resource_state'', case\n          when coalesce(t.status, ''inactive'') <> ''active'' then ''inactive''');
  if position('''multi_service'', app_private' in n)=0 or position('s.assigned_driver_id,' in n)=0 or position('active_service_multi' in n)=0 then
    raise exception 'parche cola: get_operator_resource_availability';
  end if;
  execute n;

  -- 3) La asignación rápida devuelve el lugar en la cola
  d := pg_get_functiondef('public.set_operator_service_assignment_v2(uuid,uuid,integer)'::regprocedure);
  n := replace(d,
    '''driver_name'',v_driver_name,''truck_label'',v_truck_label);',
    '''driver_name'',v_driver_name,''truck_label'',v_truck_label,''driver_queue_position'',s.driver_queue_position,''driver_multi_service'',app_private.multi_service_enabled_v1(s.assigned_driver_id));');
  if n = d then raise exception 'parche cola: set_operator_service_assignment_v2'; end if;
  execute n;
end $p$;
