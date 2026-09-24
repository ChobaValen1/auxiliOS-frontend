CREATE OR REPLACE FUNCTION app_private.sync_operator_service_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
declare v_sequence integer; v_reason text:=nullif(current_setting('app.assignment_reason',true),''); v_notes text:=nullif(current_setting('app.assignment_notes',true),''); v_test boolean;
begin
  if tg_op='INSERT' then
    if new.assigned_driver_id is not null and new.assigned_truck_id is not null then insert into public.operator_service_assignments(service_id,assignment_sequence,driver_id,truck_id,assigned_by,assigned_at,trip_id,started_at,status,is_test) values(new.service_id,1,new.assigned_driver_id,new.assigned_truck_id,new.assigned_by,coalesce(new.assigned_at,now()),new.trip_id,case when new.trip_id is not null then now() end,case when new.status='completed' then 'completed' when new.status='cancelled' then 'cancelled' else 'active' end,new.is_test); end if; return new;
  end if;
  if new.status in ('completed','cancelled') and old.status is distinct from new.status then
    update public.operator_service_assignments set status=case when new.status='completed' then 'completed' else 'cancelled' end,trip_id=coalesce(trip_id,new.trip_id,old.trip_id),released_at=coalesce(released_at,now()),released_by=coalesce(auth.uid(),new.updated_by),release_reason_code=case when new.status='cancelled' then coalesce(v_reason,new.cancellation_reason_code,'annulled') else coalesce(v_reason,'finalized') end,release_notes=coalesce(v_notes,new.cancellation_reason_detail,new.cancellation_reason),updated_at=now() where service_id=new.service_id and status='active'; return new;
  end if;
  if new.assigned_driver_id is distinct from old.assigned_driver_id or new.assigned_truck_id is distinct from old.assigned_truck_id then
    update public.operator_service_assignments set status='released',trip_id=coalesce(trip_id,old.trip_id),released_at=coalesce(released_at,now()),released_by=coalesce(auth.uid(),new.updated_by),release_reason_code=coalesce(v_reason,'assignment_changed'),release_notes=v_notes,updated_at=now() where service_id=new.service_id and status='active';
    if new.assigned_driver_id is not null and new.assigned_truck_id is not null then select coalesce(max(assignment_sequence),0)+1 into v_sequence from public.operator_service_assignments where service_id=new.service_id; v_test:=new.is_test or coalesce((select is_test from public.users where user_id=new.assigned_driver_id),false) or coalesce((select is_test from public.trucks where truck_id=new.assigned_truck_id),false); insert into public.operator_service_assignments(service_id,assignment_sequence,driver_id,truck_id,assigned_by,assigned_at,trip_id,started_at,status,is_test) values(new.service_id,v_sequence,new.assigned_driver_id,new.assigned_truck_id,new.assigned_by,coalesce(new.assigned_at,now()),new.trip_id,case when new.trip_id is not null then now() end,'active',v_test); end if;
  elsif new.trip_id is distinct from old.trip_id and new.trip_id is not null then update public.operator_service_assignments set trip_id=new.trip_id,started_at=coalesce(started_at,now()),updated_at=now() where service_id=new.service_id and status='active'; end if; return new;
end;
$function$
;
