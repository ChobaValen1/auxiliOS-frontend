-- Tercerizados · Estado › Asignar a un tercerizado · 19/10/2026 (pedido del dueño)
-- «Quiero que desde Estado › Asignar se pueda asignar a un Tercerizado.»
-- assign_outsourced_service_v2(servicio, tercerizado, localidad):
--   · sólo servicios SIN ASIGNAR, no activados por el chofer, sin remito firmado;
--   · si la logística era Propia, pasa a Tercerizada (sin chofer ni móvil);
--   · guarda el tercerizado con set_outsourced_service_cost_v1 (misma validación de tarifa y localidad,
--     conserva km / peajes / adicionales / ajuste ya cargados) y eso deja el servicio ASIGNADO.
-- Función nueva: no cambia ninguna existente.
create or replace function public.assign_outsourced_service_v2(p_service_id uuid, p_provider_id uuid, p_locality text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'app_private', 'pg_temp'
as $function$
declare
  s public.operator_services%rowtype;
  c public.outsourced_service_costs%rowtype;
  v_has_cost boolean;
  v_name text;
begin
  if coalesce(app_private.current_auxilios_role(), '') not in ('operador', 'administracion') or auth.uid() is null then
    raise exception 'Solo Operador o Administración puede cambiar el estado del servicio' using errcode = '42501';
  end if;
  select * into s from public.operator_services where service_id = p_service_id for update;
  if not found then raise exception 'Servicio inexistente'; end if;
  if s.status <> 'pending' then raise exception 'Sólo un servicio SIN ASIGNAR puede asignarse'; end if;
  if s.driver_activated then raise exception 'El servicio ya fue activado por el chofer'; end if;
  if s.remito_id is not null and exists (select 1 from public.remitos r where r.remito_id = s.remito_id and r.status in ('submitted', 'approved')) then
    raise exception 'El servicio ya tiene remito firmado';
  end if;
  if p_provider_id is null then raise exception 'Elegí el tercerizado'; end if;
  select display_name into v_name from public.outsourced_providers where provider_id = p_provider_id and is_active;
  if v_name is null then raise exception 'El tercerizado no existe o está inactivo'; end if;

  if coalesce(s.logistics_type, 'own') <> 'third_party' or s.assigned_driver_id is not null or s.assigned_truck_id is not null then
    update public.operator_services set logistics_type = 'third_party', assigned_driver_id = null, assigned_truck_id = null,
      updated_by = auth.uid(), updated_at = now()
    where service_id = p_service_id;
  end if;

  select * into c from public.outsourced_service_costs where service_id = p_service_id;
  v_has_cost := found;
  perform public.set_outsourced_service_cost_v1(p_service_id, jsonb_build_object(
    'provider_id', p_provider_id,
    'locality', nullif(btrim(coalesce(p_locality, '')), ''),
    'km_asphalt', case when v_has_cost then c.km_asphalt else 0 end,
    'km_gravel', case when v_has_cost then c.km_gravel else 0 end,
    'tolls_amount', case when v_has_cost then c.tolls_amount else 0 end,
    'extras', case when v_has_cost then coalesce(c.extras, '[]'::jsonb) else '[]'::jsonb end,
    'adjustment_amount', case when v_has_cost then coalesce(c.adjustment_amount, 0) else 0 end,
    'adjustment_reason', case when v_has_cost then c.adjustment_reason end));

  select * into s from public.operator_services where service_id = p_service_id;
  return jsonb_build_object('service_id', s.service_id, 'status', s.status, 'provider_name', v_name);
end $function$;

revoke all on function public.assign_outsourced_service_v2(uuid, uuid, text) from public, anon;
grant execute on function public.assign_outsourced_service_v2(uuid, uuid, text) to authenticated;
