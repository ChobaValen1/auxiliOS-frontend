-- Ingresos sin servicio · anular y vincular a servicios Pendientes · 20/10/2026 (pedido del dueño, planilla P1 y P2)
-- 1) annul_driver_service_intake_v1: el Chofer anula su propio ingreso mientras no esté vinculado; Administración
--    y Operador, cualquier ingreso pendiente. Motivo obligatorio. El ingreso pasa a 'rejected', el remito a 'anulado'
--    y el viaje se cierra. Queda el evento con quién, cuándo y por qué. No borra nada.
-- 2) link_driver_service_intake_v1 acepta también un servicio PENDIENTE sin chofer: primero se lo asigna al Chofer
--    y Móvil del ingreso (con las mismas validaciones de set_operator_service_assignment_v2) y después lo vincula.
--    Un servicio asignado a otro Chofer o Móvil se sigue rechazando. Reemplazo puntual (falla si no encuentra el texto).
create or replace function public.annul_driver_service_intake_v1(
  p_intake_id uuid default null, p_remito_id integer default null,
  p_reason_code text default null, p_reason_detail text default null)
returns jsonb language plpgsql security definer set search_path to 'public','app_private','pg_temp' as $function$
declare
  v_uid uuid := auth.uid();
  v_role text := app_private.current_auxilios_role();
  v_reason text := lower(btrim(coalesce(p_reason_code,'')));
  v_detail text := nullif(btrim(coalesce(p_reason_detail,'')),'');
  v_label text;
  v_note text;
  i public.driver_service_intakes%rowtype;
begin
  if v_uid is null or coalesce(v_role,'') not in ('chofer','administracion','operador') then
    raise exception 'Sin permiso para anular el ingreso';
  end if;
  v_label := case v_reason when 'duplicate' then 'Cargado repetido' when 'entry_error' then 'Error de carga'
    when 'customer_cancelled' then 'El cliente canceló' when 'other' then 'Otro' end;
  if v_label is null then raise exception 'Seleccioná el motivo de la anulación'; end if;
  if v_reason = 'other' and v_detail is null then raise exception 'Contá brevemente el motivo'; end if;

  if p_intake_id is not null then
    select * into i from public.driver_service_intakes where intake_id=p_intake_id for update;
  elsif p_remito_id is not null then
    select di.* into i from public.driver_service_intakes di
    where di.intake_id=(select r.driver_intake_id from public.remitos r where r.remito_id=p_remito_id)
    for update;
  end if;
  if i.intake_id is null then raise exception 'El ingreso ya no está disponible'; end if;
  if v_role = 'chofer' and i.driver_id is distinct from v_uid then
    raise exception 'Sólo podés anular tus propios ingresos';
  end if;
  if i.status <> 'pending_admin' or i.linked_service_id is not null then
    raise exception 'El ingreso ya fue resuelto por Operaciones';
  end if;

  v_note := 'ANULADO: '||v_label||coalesce(' · '||v_detail,'');
  update public.remitos
  set status='anulado', sync_status='synced', observaciones=concat_ws(E'\n',nullif(observaciones,''),v_note)
  where remito_id=i.remito_id and status in ('pendiente','firmado') and operator_service_id is null;

  update public.trips
  set fecha_hora_fin=coalesce(fecha_hora_fin,greatest(now(),fecha_hora_inicio)),
      notes=concat_ws(E'\n',nullif(notes,''),v_note), received_at=now(), sync_status='synced'
  where trip_id=i.trip_id;

  update public.driver_service_intakes
  set status='rejected', document_status=case when document_status='draft' then 'rejected' else document_status end,
      driver_notes=concat_ws(E'\n',nullif(driver_notes,''),v_note), updated_at=now()
  where intake_id=i.intake_id returning * into i;

  insert into public.driver_service_intake_events(intake_id,event_type,notes,created_by,details)
  values(i.intake_id,'annulled',v_note,v_uid,
    jsonb_build_object('reason_code',v_reason,'reason_label',v_label,'reason_detail',v_detail,'role',v_role,'remito_id',i.remito_id));

  return jsonb_build_object('intake_id',i.intake_id,'intake_number',i.intake_number,'status',i.status,
    'remito_id',i.remito_id,'reason_code',v_reason,'reason_label',v_label);
end;
$function$;
revoke all on function public.annul_driver_service_intake_v1(uuid,integer,text,text) from public, anon;
grant execute on function public.annul_driver_service_intake_v1(uuid,integer,text,text) to authenticated;

do $mig$ declare d text; a text := $a$  if s.status not in ('assigned','at_origin') then raise exception 'El servicio debe estar ASIGNADO o ARRIBADO'; end if;$a$; begin
  d := replace(pg_get_functiondef('public.link_driver_service_intake_v1(uuid,uuid)'::regprocedure), E'\r', '');
  if position('set_operator_service_assignment_v2' in d) = 0 then
    if (length(d)-length(replace(d,a,'')))/length(a) <> 1 then raise exception 'link_driver_service_intake_v1: texto no encontrado'; end if;
    d := replace(d, a, $b$  if s.status='pending' and s.assigned_driver_id is null and s.remito_id is null then
    perform public.set_operator_service_assignment_v2(s.service_id,i.driver_id,i.truck_id);
    select * into s from public.operator_services where service_id=p_service_id for update;
  end if;
  if s.status not in ('assigned','at_origin') then raise exception 'El servicio debe estar SIN ASIGNAR, ASIGNADO o ARRIBADO'; end if;$b$);
    execute d;
  end if;
end $mig$;
