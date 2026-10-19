-- El chofer marca "Llegué al origen" sin depender del remito · 15/10/2026
-- Muchos choferes completan el remito al final (para anotar los peajes); el arribo se marcaba recién con la firma.
-- Ahora el chofer marca el arribo al llegar (driver_arrived_at) y la firma posterior conserva esa hora.
alter table public.operator_services add column if not exists driver_arrived_at timestamptz;

create or replace function public.driver_mark_arrived_v1(p_service_id uuid)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare s public.operator_services%rowtype; uid uuid:=auth.uid();
begin
  if uid is null or coalesce(app_private.current_auxilios_role(),'')<>'chofer' then raise exception 'Solo el chofer asignado puede marcar el arribo'; end if;
  select * into s from public.operator_services where service_id=p_service_id for update;
  if not found then raise exception 'Servicio inexistente'; end if;
  if s.assigned_driver_id is distinct from uid then raise exception 'El servicio no está asignado a este Chofer'; end if;
  if s.driver_activated then raise exception 'El servicio está activado'; end if;
  if s.status='at_origin' then return jsonb_build_object('service_id',s.service_id,'status',s.status,'arrived_at',s.arrived_at,'idempotent',true); end if;
  if s.status<>'assigned' then raise exception 'Solo un servicio ASIGNADO puede marcarse como arribado'; end if;
  perform set_config('app.phase3_bridge','1',true);
  perform set_config('app.lifecycle_transition','manual_arrival',true);
  update public.operator_services set status='at_origin',arrived_at=now(),driver_arrived_at=now(),arrived_by=uid,arrival_source=null,arrival_reason_code=null,updated_by=uid
  where service_id=p_service_id returning * into s;
  -- El evento 'arrived' lo registra el disparador operator_services_log_event.
  return jsonb_build_object('service_id',s.service_id,'status',s.status,'arrived_at',s.arrived_at);
end $function$;
revoke all on function public.driver_mark_arrived_v1(uuid) from public, anon;
grant execute on function public.driver_mark_arrived_v1(uuid) to authenticated;

-- La firma ya no pisa la hora de arribo que marcó el chofer (si el servicio sigue arribado).
do $$
declare d text:=pg_get_functiondef('app_private.mark_operator_service_arrived_signature_v2'::regproc); n text;
begin
  n:=replace(d,$a$update public.operator_services set status='at_origin',arrived_at=coalesce(r.firmado_at,now()),arrived_by=r.driver_id,$a$,
    $a$update public.operator_services set status='at_origin',arrived_at=case when s.status='at_origin' and s.driver_arrived_at is not null then s.driver_arrived_at else coalesce(r.firmado_at,now()) end,arrived_by=r.driver_id,$a$);
  if n=d or position('s.driver_arrived_at' in n)=0 then raise exception 'No se pudo parchear mark_operator_service_arrived_signature_v2'; end if;
  execute n;
end $$;

-- Con el arribo marcado por el chofer (y sin remito firmado), el chofer puede seguir completando datos y el remito.
do $$
declare d text; n text;
begin
  d:=pg_get_functiondef('public.complete_driver_operator_service_fields_v2(uuid,jsonb)'::regprocedure);
  n:=replace(d,$a$if v_service.status<>'assigned' then raise exception$a$,
    $a$if v_service.status<>'assigned' and not (v_service.status='at_origin' and v_service.driver_arrived_at is not null and coalesce(v_service.document_status,'') not in ('submitted','approved','exception_approved')) then raise exception$a$);
  if n=d then raise exception 'No se pudo parchear complete_driver_operator_service_fields_v2'; end if;
  execute n;

  d:=pg_get_functiondef('public.save_driver_operator_service_remito_v3(uuid,jsonb,uuid)'::regprocedure);
  n:=replace(d,$a$  if s.status='assigned' then
    perform public.complete_driver_operator_service_fields_v2($a$,
    $a$  if s.status='assigned' or (s.status='at_origin' and s.driver_arrived_at is not null and coalesce(s.document_status,'') not in ('submitted','approved','exception_approved')) then
    perform public.complete_driver_operator_service_fields_v2($a$);
  if n=d then raise exception 'No se pudo parchear save_driver_operator_service_remito_v3'; end if;
  execute n;

  d:=pg_get_functiondef('public.get_driver_operator_queue_v4()'::regprocedure);
  n:=replace(d,$a$'single_address',coalesce((select sc.single_address from public.service_concepts sc where sc.concept_id=s.primary_concept_id),false)
  ) order by q.ordinality)$a$,
    $a$'single_address',coalesce((select sc.single_address from public.service_concepts sc where sc.concept_id=s.primary_concept_id),false),
    'driver_arrived_at',s.driver_arrived_at,'arrived_at',s.arrived_at
  )||case when s.status='at_origin' and s.driver_arrived_at is not null and coalesce(q.value->>'remito_status','')<>'firmado'
      then jsonb_build_object('can_complete_remito',true,'remito_action','complete') else '{}'::jsonb end
  order by q.ordinality)$a$);
  if n=d then raise exception 'No se pudo parchear get_driver_operator_queue_v4'; end if;
  execute n;
end $$;
