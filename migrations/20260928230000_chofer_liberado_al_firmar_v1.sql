-- Chofer liberado al firmar el remito.
--
-- Con el remito firmado el chofer terminó: el servicio sale de su cola, el
-- chofer y el móvil quedan libres para otro servicio (o un remito sin
-- asignación) y ya no puede editar el remito firmado. El servicio sigue en
-- Servicios activos (ARRIBADO) hasta que Operaciones/Administración lo revisa,
-- cobra y finaliza.
--
-- Los chequeos de "ocupado" se parchean en el texto de cada función existente:
-- si el fragmento esperado no aparece, la migración falla sin cambiar nada.

create or replace function app_private.service_driver_done_v1(p_service_id uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select exists (
    select 1 from public.operator_services s
      join public.remitos r on r.remito_id = s.remito_id
     where s.service_id = p_service_id and (r.status = 'firmado' or r.firmado_at is not null));
$function$;
revoke all on function app_private.service_driver_done_v1(uuid) from public, anon;
grant execute on function app_private.service_driver_done_v1(uuid) to authenticated;

do $patch$
declare d text; n text;
begin
  -- 1) Un chofer/móvil no queda "ocupado" por un servicio con remito firmado.
  d := pg_get_functiondef('app_private.validate_operator_service_resource_pair_v1()'::regprocedure);
  n := replace(d, $x$s.status in ('assigned','at_origin','en_route','loaded','at_destination')$x$,
                  $x$s.status in ('assigned','at_origin','en_route','loaded','at_destination') and not app_private.service_driver_done_v1(s.service_id)$x$);
  if n = d then raise exception 'patch validate_operator_service_resource_pair_v1: fragmento no encontrado'; end if;
  execute n;

  -- 2) Disponibilidad para asignar: igual criterio.
  d := pg_get_functiondef('public.get_operator_resource_availability()'::regprocedure);
  n := replace(d, $x$s.status in ('assigned', 'en_route', 'at_origin', 'loaded', 'at_destination')$x$,
                  $x$s.status in ('assigned', 'en_route', 'at_origin', 'loaded', 'at_destination') and not app_private.service_driver_done_v1(s.service_id)$x$);
  if n = d then raise exception 'patch get_operator_resource_availability: fragmento no encontrado'; end if;
  execute n;

  -- 3) Remito sin asignación: un servicio ya firmado no lo bloquea.
  d := pg_get_functiondef('public.save_driver_ad_hoc_remito_v1(jsonb,uuid)'::regprocedure);
  n := replace(d, $x$where s.assigned_driver_id=v_uid and s.status in ('assigned','at_origin')$x$,
                  $x$where s.assigned_driver_id=v_uid and s.status in ('assigned','at_origin') and not app_private.service_driver_done_v1(s.service_id)$x$);
  if n = d then raise exception 'patch save_driver_ad_hoc_remito_v1: fragmento no encontrado'; end if;
  execute n;

  -- 4) El chofer ya no edita el remito firmado: lo corrige Operaciones.
  d := pg_get_functiondef('public.get_driver_signed_remito_edit_v1(uuid)'::regprocedure);
  n := regexp_replace(d, E'\nbegin\n', E'\nbegin\n  raise exception ''El remito ya está firmado. Las correcciones las hace Operaciones.'';\n');
  if n = d then raise exception 'patch get_driver_signed_remito_edit_v1: begin no encontrado'; end if;
  execute n;
  d := pg_get_functiondef('public.update_driver_signed_remito_v1(uuid,jsonb,uuid)'::regprocedure);
  n := regexp_replace(d, E'\nbegin\n', E'\nbegin\n  raise exception ''El remito ya está firmado. Las correcciones las hace Operaciones.'';\n');
  if n = d then raise exception 'patch update_driver_signed_remito_v1: begin no encontrado'; end if;
  execute n;
end
$patch$;

-- 5) La cola del chofer no muestra los servicios con remito firmado.
create or replace function public.get_driver_operator_queue_v4()
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_queue jsonb; v_result jsonb;
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'')<>'chofer' then
    raise exception 'Sólo choferes pueden consultar su cola';
  end if;
  v_queue:=public.get_driver_operator_queue_v3();
  select coalesce(jsonb_agg(q.value||jsonb_build_object(
    'customer_document',s.customer_document,
    'origin_lat',s.origin_lat,'origin_lng',s.origin_lng,
    'destination_lat',s.destination_lat,'destination_lng',s.destination_lng,
    'origin_place_id',s.origin_place_id,'destination_place_id',s.destination_place_id,
    'origin_formatted_address',s.origin_formatted_address,
    'destination_formatted_address',s.destination_formatted_address,
    'single_address',coalesce((select sc.single_address from public.service_concepts sc where sc.concept_id=s.primary_concept_id),false)
  ) order by q.ordinality),'[]'::jsonb) into v_result
  from jsonb_array_elements(v_queue) with ordinality q(value,ordinality)
  join public.operator_services s on s.service_id=(q.value->>'service_id')::uuid
  where s.assigned_driver_id=auth.uid()
    and not app_private.service_driver_done_v1(s.service_id);
  return v_result;
end;
$function$;
