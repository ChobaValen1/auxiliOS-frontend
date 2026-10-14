-- Link only the original voided document to its recorded activation driver.
CREATE OR REPLACE FUNCTION app_private.normalize_operator_service_remito_v3()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
declare
  s public.operator_services%rowtype;
  t public.trips%rowtype;
  v_new_link boolean;
  v_service_id uuid;
begin
  if new.operator_service_id is null and new.trip_id is not null then
    select service_id into v_service_id
    from public.operator_services
    where trip_id=new.trip_id
      and (assigned_driver_id is null or assigned_driver_id is not distinct from new.driver_id)
    order by created_at desc
    limit 1;
    new.operator_service_id:=v_service_id;
  end if;

  if new.operator_service_id is null then return new; end if;

  select * into s
  from public.operator_services
  where service_id=new.operator_service_id
  for update;
  if not found then raise exception 'Servicio inexistente para el remito'; end if;

  if tg_op='INSERT' then
    v_new_link:=true;
  else
    v_new_link:=old.operator_service_id is distinct from new.operator_service_id;
  end if;

  if v_new_link then
    if s.status not in ('assigned','at_origin') then
      raise exception 'El servicio no está disponible para recibir un remito';
    end if;
    if s.driver_activated then
      if new.status is distinct from 'anulado'
        or s.remito_id is distinct from new.remito_id
        or s.activation_driver_id is null
        or s.activation_driver_id is distinct from new.driver_id then
        raise exception 'El documento no corresponde a la salida activada';
      end if;
    elsif s.assigned_driver_id is null or s.assigned_driver_id is distinct from new.driver_id then
      raise exception 'El remito no pertenece al chofer asignado';
    end if;
    if s.trip_id is null then raise exception 'El servicio todavía no tiene un viaje preparado'; end if;
  end if;

  if s.trip_id is not null then
    if new.trip_id is null then new.trip_id:=s.trip_id;
    elsif new.trip_id is distinct from s.trip_id then
      raise exception 'El remito no corresponde al viaje del servicio';
    end if;

    select * into t from public.trips where trip_id=s.trip_id;
    if not found then raise exception 'Viaje inexistente para el servicio'; end if;
    if new.log_id is null then new.log_id:=t.log_id;
    elsif new.log_id is distinct from t.log_id then
      raise exception 'El remito no corresponde a la jornada del servicio';
    end if;
    if v_new_link and t.driver_id is distinct from new.driver_id then
      raise exception 'El viaje no pertenece al chofer del remito';
    end if;
  end if;

  if v_new_link then
    -- Al clasificar un ingreso iniciado sin operador conserva su procedencia.
    if new.document_source is distinct from 'driver_ad_hoc' then
      new.document_source:='auxilios_driver';
    end if;
  end if;
  return new;
end;
$function$
;
