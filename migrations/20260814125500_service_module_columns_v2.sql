-- AuxiliOS · configuración de mesa operativa v2
-- Reemplaza el modelo viejo de columnas agrupadas por las 17 columnas operativas definitivas.
-- Agrega el detalle configurable de Origen/Destino sin conservar claves visuales anteriores.

alter table public.service_module_settings
  add column if not exists location_detail jsonb not null
  default '{"address":true,"locality":true,"province":false}'::jsonb;

update public.service_module_settings
set column_order='["code","datetime","arrival","finish","provider","base","type","origin","destination","client","km","driver","delay","mobile","status","amount_due","actions"]'::jsonb,
    column_visibility='{"code":true,"datetime":true,"arrival":false,"finish":false,"provider":true,"base":true,"type":true,"origin":true,"destination":true,"client":true,"km":true,"driver":true,"delay":false,"mobile":true,"status":true,"amount_due":true,"actions":true}'::jsonb,
    location_detail=coalesce(location_detail,'{"address":true,"locality":true,"province":false}'::jsonb),
    updated_at=now()
where settings_key='default'
  and (
    column_order ? 'service'
    or column_order ? 'route'
    or column_order ? 'customer_vehicle'
    or column_order ? 'resource'
  );

create or replace function public.get_service_module_configuration()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text:=app_private.current_auxilios_role();
  v_row public.service_module_settings%rowtype;
begin
  if v_role not in ('administracion','operador','supervision','facturacion') then
    raise exception 'Sin permiso para consultar la configuración de Servicios';
  end if;
  select * into v_row from public.service_module_settings where settings_key='default';
  return jsonb_build_object(
    'column_order',v_row.column_order,
    'column_visibility',v_row.column_visibility,
    'location_detail',v_row.location_detail,
    'field_modes',v_row.field_modes,
    'workflow',v_row.workflow,
    'updated_at',v_row.updated_at
  );
end;
$$;

create or replace function public.save_service_module_configuration(p_config jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text:=app_private.current_auxilios_role();
  v_row public.service_module_settings%rowtype;
  v_allowed text[]:=array['code','datetime','arrival','finish','provider','base','type','origin','destination','client','km','driver','delay','mobile','status','amount_due','actions'];
  v_order jsonb:=coalesce(p_config->'column_order','[]'::jsonb);
  v_visibility jsonb:=coalesce(p_config->'column_visibility','{}'::jsonb);
  v_location jsonb:=coalesce(p_config->'location_detail','{}'::jsonb);
  v_key text;
begin
  if v_role<>'administracion' then
    raise exception 'Solo Administración puede modificar la configuración de Servicios';
  end if;
  if jsonb_typeof(v_order)<>'array' or jsonb_array_length(v_order)<>array_length(v_allowed,1) then
    raise exception 'La configuración de columnas debe contener las 17 columnas operativas';
  end if;
  for v_key in select jsonb_array_elements_text(v_order) loop
    if not (v_key=any(v_allowed)) then raise exception 'Columna de Servicios inválida: %',v_key; end if;
  end loop;
  if (select count(distinct value) from jsonb_array_elements_text(v_order))<>array_length(v_allowed,1) then
    raise exception 'La configuración de columnas contiene duplicados';
  end if;
  for v_key in select unnest(v_allowed) loop
    if jsonb_typeof(v_visibility->v_key)<>'boolean' then
      raise exception 'La visibilidad de % debe ser booleana',v_key;
    end if;
  end loop;
  for v_key in select unnest(array['address','locality','province']) loop
    if jsonb_typeof(v_location->v_key)<>'boolean' then
      raise exception 'El detalle geográfico % debe ser booleano',v_key;
    end if;
  end loop;

  update public.service_module_settings
  set column_order=v_order,
      column_visibility=v_visibility,
      location_detail=v_location,
      field_modes=coalesce(p_config->'field_modes',field_modes),
      workflow=coalesce(p_config->'workflow',workflow),
      updated_at=now(),
      updated_by=auth.uid()
  where settings_key='default'
  returning * into v_row;

  return jsonb_build_object(
    'column_order',v_row.column_order,
    'column_visibility',v_row.column_visibility,
    'location_detail',v_row.location_detail,
    'field_modes',v_row.field_modes,
    'workflow',v_row.workflow,
    'updated_at',v_row.updated_at
  );
end;
$$;

revoke all on function public.get_service_module_configuration() from public,anon;
revoke all on function public.save_service_module_configuration(jsonb) from public,anon;
grant execute on function public.get_service_module_configuration() to authenticated,service_role;
grant execute on function public.save_service_module_configuration(jsonb) to authenticated,service_role;
