-- Tercerizados · «Asignar» un servicio Tercerizada al tercerizado (sin chofer ni móvil) · 19/10/2026 (pedido del dueño)
-- Con el tercerizado elegido, Estado › Asignar pasa el servicio a ASIGNADO (antes pedía chofer y móvil propios
-- y quedaba en «Sin asignar»). Desde ASIGNADO se finaliza o se quita la asignación como siempre.
--   · operator_services_before_update: PENDIENTE → ASIGNADO sin chofer, sólo Tercerizada y vía assign_outsourced_service_v1;
--     y un ASIGNADO tercerizado sin chofer no vuelve solo a PENDIENTE al editarlo.
--   · assign_outsourced_service_v1(p_service_id): Operador/Administración; exige Tercerizada, SIN ASIGNAR y tercerizado elegido.
-- Propia sigue igual. Se aplica con reemplazos puntuales (falla si no encuentra el texto).
do $mig$ declare d text; begin
  d := pg_get_functiondef('app_private.operator_services_before_update'::regproc);
  if position('outsourced_assign' in d)=0 then
    d := replace(d, $a$    if old.status='pending' and new.status='assigned' then if new.assigned_driver_id is null or new.assigned_truck_id is null then raise exception 'Para asignar el servicio se requieren Chofer y Móvil'; end if;$a$,
$b$    if old.status='pending' and new.status='assigned' and v_transition='outsourced_assign' and coalesce(new.logistics_type,'own')='third_party' then null;
    elsif old.status='pending' and new.status='assigned' then if new.assigned_driver_id is null or new.assigned_truck_id is null then raise exception 'Para asignar el servicio se requieren Chofer y Móvil'; end if;$b$);
    d := replace(d, $a$  if new.assigned_driver_id is null and new.assigned_truck_id is null and new.status='assigned' and old.status='assigned' then new.status:='pending';end if;$a$,
$b$  if new.assigned_driver_id is null and new.assigned_truck_id is null and new.status='assigned' and old.status='assigned' and coalesce(new.logistics_type,'own')<>'third_party' then new.status:='pending';end if;$b$);
    if position('outsourced_assign' in d)=0 or position($x$and coalesce(new.logistics_type,'own')<>'third_party' then new.status:='pending'$x$ in d)=0 then
      raise exception 'operator_services_before_update: no se encontró el texto a reemplazar';
    end if;
    execute d;
  end if;
end $mig$;

create or replace function public.assign_outsourced_service_v1(p_service_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'app_private', 'pg_temp' as $function$
declare s public.operator_services%rowtype; v_name text;
begin
  if coalesce(app_private.current_auxilios_role(),'') not in ('operador','administracion') or auth.uid() is null then raise exception 'Solo Operador o Administración puede cambiar el estado del servicio'; end if;
  select * into s from public.operator_services where service_id=p_service_id for update;
  if not found then raise exception 'Servicio inexistente'; end if;
  if coalesce(s.logistics_type,'own')<>'third_party' then raise exception 'Sólo un servicio con logística Tercerizada se asigna a un tercerizado'; end if;
  if s.status<>'pending' then raise exception 'Sólo un servicio SIN ASIGNAR puede asignarse'; end if;
  select p.display_name into v_name from public.outsourced_service_costs c join public.outsourced_providers p on p.provider_id=c.provider_id where c.service_id=p_service_id;
  if v_name is null then raise exception 'Primero elegí qué tercerizado hace el servicio (Editar servicio › ¿Quién hace el servicio?)'; end if;
  perform set_config('app.lifecycle_transition','outsourced_assign',true);
  update public.operator_services set status='assigned', updated_by=auth.uid() where service_id=p_service_id returning * into s;
  insert into public.operator_service_events(service_id,event_type,notes,created_by,details) values(p_service_id,'outsourced_assigned','Asignado al tercerizado '||v_name,auth.uid(),jsonb_build_object('provider_name',v_name));
  return jsonb_build_object('service_id',s.service_id,'status',s.status,'provider_name',v_name);
end $function$;
revoke all on function public.assign_outsourced_service_v1(uuid) from public, anon;
grant execute on function public.assign_outsourced_service_v1(uuid) to authenticated;
