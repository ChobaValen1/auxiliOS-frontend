-- Recupera el borrador vinculado sin exponer tablas al frontend. El chofer
-- sólo puede consultar el servicio que tiene actualmente asignado.
create or replace function public.get_driver_operator_service_remito_draft_v1(p_service_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,app_private,pg_temp
as $function$
declare
  v_uid uuid:=auth.uid();
  v_role text:=app_private.current_auxilios_role();
  s public.operator_services%rowtype;
  r public.remitos%rowtype;
  v_addons jsonb;
begin
  if v_uid is null or v_role<>'chofer' then
    raise exception 'Solo los choferes pueden recuperar este borrador';
  end if;

  select * into s
  from public.operator_services
  where service_id=p_service_id;
  if not found then raise exception 'Servicio inexistente'; end if;
  if s.assigned_driver_id is distinct from v_uid then
    raise exception 'El servicio no está asignado a este chofer';
  end if;

  select * into r
  from public.remitos
  where operator_service_id=p_service_id
    and driver_id=v_uid
    and status='pendiente'
  order by remito_id desc
  limit 1;
  if not found then return null; end if;

  if r.addons_version=2 then
    v_addons:=public.get_driver_remito_addons_v2(r.remito_id);
  else
    v_addons:=jsonb_build_object(
      'addons_version',2,
      'tolls','[]'::jsonb,
      'excesses','[]'::jsonb,
      'evidence','[]'::jsonb
    );
  end if;

  return jsonb_build_object(
    'remito_id',r.remito_id,
    'nro_remito',r.nro_remito,
    'customer_name',r.razon_social,
    'customer_document',r.cuit,
    'customer_phone',r.telefono,
    'vehicle_plate',r.patente,
    'vehicle_make_model',r.marca_modelo,
    'origin',r.origen,
    'destination',r.destino,
    'km_reales',r.km_reales,
    'observations',r.observaciones,
    'addons',v_addons
  );
end;
$function$;

comment on function public.get_driver_operator_service_remito_draft_v1(uuid) is
  'Borrador privado del remito asignado al chofer, incluidos peajes y excedentes v2.';

revoke all on function public.get_driver_operator_service_remito_draft_v1(uuid) from public,anon,authenticated;
grant execute on function public.get_driver_operator_service_remito_draft_v1(uuid) to authenticated;
