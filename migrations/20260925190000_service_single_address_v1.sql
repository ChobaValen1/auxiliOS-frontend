-- Tipos de Servicio de una sola dirección (p. ej. UML): el servicio se resuelve
-- en el origen, sin traslado a un destino.
--
-- · service_concepts.single_address: el toggle vive en Configuración → Tipos de
--   Servicio, así que aplica a cualquier tipo, no solo a UML.
-- · El servicio sigue guardando destination (la columna es NOT NULL y la usan
--   remitos, reportes y la facturación): el frontend copia el origen al destino.
--   Así el recorrido Base → Origen → Destino → Base queda Base → Origen → Base
--   sin tocar el cálculo de rutas ni las validaciones existentes.
-- · El dato se expone en el catálogo, en el contexto del servicio y en la cola
--   del chofer, que con eso oculta Destino en el remito.

alter table public.service_concepts
  add column if not exists single_address boolean not null default false;

comment on column public.service_concepts.single_address is
  'Se resuelve en el origen: el servicio no tiene destino propio (destino = origen).';

-- Guardar el toggle desde el editor de Tipos de Servicio.
do $migration$
declare v_sql text; v_before text;
begin
  select pg_get_functiondef('public.save_service_type_config(jsonb)'::regprocedure) into v_sql;
  v_before := v_sql;
  v_sql := replace(v_sql,
    E'  if v_row.concept_id is null then\n    raise exception ''Tipo de servicio inexistente'';',
    E'  if v_row.concept_id is not null and p_payload ? ''single_address'' then\n    update public.service_concepts\n       set single_address = coalesce((p_payload->>''single_address'')::boolean, false)\n     where concept_id = v_row.concept_id\n    returning * into v_row;\n  end if;\n\n  if v_row.concept_id is null then\n    raise exception ''Tipo de servicio inexistente'';');
  if v_sql = v_before then raise exception 'save_service_type_config: no se encontró el punto de inserción'; end if;
  execute v_sql;
end
$migration$;

-- Listado del catálogo.
do $migration$
declare v_sql text; v_before text;
begin
  select pg_get_functiondef('public.list_service_types_config(boolean)'::regprocedure) into v_sql;
  v_before := v_sql;
  v_sql := replace(v_sql, $a$'is_active',sc.is_active,$a$, $a$'is_active',sc.is_active,'single_address',sc.single_address,$a$);
  if v_sql = v_before then raise exception 'list_service_types_config: no se encontró is_active'; end if;
  execute v_sql;
end
$migration$;

-- Contexto del servicio (Nuevo servicio / edición).
do $migration$
declare v_oid oid; v_sql text; v_before text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_operator_service_context_v1' order by p.oid desc limit 1;
  select pg_get_functiondef(v_oid) into v_sql;
  v_before := v_sql;
  v_sql := replace(v_sql, $a$'distance_chargeable',sc.distance_chargeable,'code_mode'$a$,
                          $a$'distance_chargeable',sc.distance_chargeable,'single_address',sc.single_address,'code_mode'$a$);
  if v_sql = v_before then raise exception 'get_operator_service_context_v1: no se encontró distance_chargeable'; end if;
  execute v_sql;
end
$migration$;

-- Cola del chofer: el remito oculta Destino cuando el tipo principal es de una sola dirección.
do $migration$
declare v_sql text; v_before text;
begin
  select pg_get_functiondef('public.get_driver_operator_queue_v4()'::regprocedure) into v_sql;
  v_before := v_sql;
  v_sql := replace(v_sql, $a$'destination_formatted_address',s.destination_formatted_address$a$,
                          $a$'destination_formatted_address',s.destination_formatted_address,
    'single_address',coalesce((select sc.single_address from public.service_concepts sc where sc.concept_id=s.primary_concept_id),false)$a$);
  if v_sql = v_before then raise exception 'get_driver_operator_queue_v4: no se encontró destination_formatted_address'; end if;
  execute v_sql;
end
$migration$;
