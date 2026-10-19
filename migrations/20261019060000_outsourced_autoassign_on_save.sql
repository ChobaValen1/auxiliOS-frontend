-- Tercerizados · al elegir el tercerizado el servicio queda ASIGNADO · 19/10/2026 (pedido del dueño)
-- «Cuando pongo Tercerizado se supone que ya está asignado.»
-- set_outsourced_service_cost_v1 (se llama al guardar el servicio):
--   · con Logística Tercerizada y tercerizado elegido, un servicio PENDIENTE pasa a ASIGNADO
--     (transición 'outsourced_assign' + evento 'outsourced_assigned');
--   · si se quita el tercerizado (o se pasa a Propia) y estaba ASIGNADO sin chofer, vuelve a PENDIENTE.
-- Reemplazo puntual sobre la función vigente (falla si no encuentra su texto).
do $mig$ declare d text; begin
  d := pg_get_functiondef('public.set_outsourced_service_cost_v1(uuid,jsonb)'::regprocedure);
  if position('outsourced_assign' in d)=0 then
    d := replace(d, $a$      where service_id = p_service_id returning * into v_row;$a$,
$b$      where service_id = p_service_id returning * into v_row;
      -- Sin tercerizado: si estaba Asignado sólo por el tercerizado (sin chofer), vuelve a Sin asignar.
      if s.status = 'assigned' and s.assigned_driver_id is null and coalesce(s.logistics_type, 'own') = 'third_party' then
        update public.operator_services set status = 'pending', updated_by = auth.uid() where service_id = p_service_id;
      end if;$b$);
    d := replace(d, $a$  returning * into v_row;
  return case when v_role = 'administracion' then to_jsonb(v_row) else app_private.outsourced_hide_amounts(to_jsonb(v_row)) end;
end$a$, $b$  returning * into v_row;
  -- Con el tercerizado elegido, el servicio queda Asignado (no hay chofer ni móvil propios que asignar).
  if s.status = 'pending' then
    perform set_config('app.lifecycle_transition', 'outsourced_assign', true);
    update public.operator_services set status = 'assigned', updated_by = auth.uid() where service_id = p_service_id;
    insert into public.operator_service_events(service_id, event_type, notes, created_by, details)
    values (p_service_id, 'outsourced_assigned', 'Asignado al tercerizado ' || coalesce(q->>'provider_name', ''), auth.uid(), jsonb_build_object('provider_name', q->>'provider_name'));
  end if;
  return case when v_role = 'administracion' then to_jsonb(v_row) else app_private.outsourced_hide_amounts(to_jsonb(v_row)) end;
end$b$);
    if position('outsourced_assign' in d)=0 or position('vuelve a Sin asignar' in d)=0 then raise exception 'set_outsourced_service_cost_v1: no se encontró el texto a reemplazar'; end if;
    execute d;
  end if;
end $mig$;
