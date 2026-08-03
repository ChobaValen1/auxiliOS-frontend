-- AuxiliOS Phase 3B · part 5/7
create or replace function public.review_operator_service_closure(
  p_service_id uuid,
  p_billing_status text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  v_role text := app_private.current_auxilios_role();
  v_uid uuid := auth.uid();
  v_status text := lower(coalesce(nullif(btrim(p_billing_status), ''), ''));
  v_closure public.operator_service_closures%rowtype;
begin
  if v_uid is null or v_role not in ('administracion','facturacion') then
    raise exception 'Sin permiso para revisar la condición económica';
  end if;
  if v_status not in (
    'pending_review','billable','non_billable',
    'billable_km','billable_origin','billable_movement'
  ) then
    raise exception 'Condición económica inválida';
  end if;

  update public.operator_service_closures
  set billing_status = v_status,
      billing_notes = nullif(btrim(p_notes), ''),
      billing_reviewed_by = v_uid,
      billing_reviewed_at = now(),
      updated_at = now()
  where service_id = p_service_id
  returning * into v_closure;

  if not found then
    raise exception 'El servicio no tiene un cierre operativo para revisar';
  end if;

  insert into public.operator_service_events(
    service_id, event_type, notes, created_by
  )
  values (
    p_service_id,
    'billing_review',
    concat_ws(' · ', 'Condición: ' || v_status, nullif(btrim(p_notes), '')),
    v_uid
  );

  return jsonb_build_object(
    'service_id', p_service_id,
    'closure_id', v_closure.closure_id,
    'billing_status', v_closure.billing_status,
    'billing_reviewed_at', v_closure.billing_reviewed_at
  );
end;
$function$;
