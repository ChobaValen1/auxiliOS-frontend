-- Los conceptos interruptor aplican a todas las prestadoras: no dependen de company_service_settings,
-- así no aparecen en la lista de conceptos con precio del operador.
create or replace function public.get_service_toggle_concepts_v1(p_company_id uuid default null, p_service_id uuid default null)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
  v_role text := coalesce(app_private.current_auxilios_role(), '');
  v_driver uuid;
  v_selected uuid[] := '{}';
begin
  if auth.uid() is null or v_role not in ('administracion','operador','supervision','facturacion','chofer') then
    raise exception 'Sin permiso';
  end if;
  if p_service_id is not null then
    select s.assigned_driver_id into v_driver from public.operator_services s where s.service_id = p_service_id;
    if not found then raise exception 'Servicio inexistente'; end if;
    if v_role = 'chofer' and v_driver is distinct from auth.uid() then raise exception 'Sin permiso'; end if;
    select coalesce(array_agg(distinct m.concept_id), '{}') into v_selected
    from public.service_toggle_marks m
    where m.is_on and ((m.source = 'operator' and m.service_id = p_service_id)
       or (m.source = 'driver' and m.remito_id in (
            select r.remito_id from public.remitos r
            where r.operator_service_id = p_service_id
              and (v_role <> 'chofer' or r.driver_id = auth.uid()))));
  end if;
  return jsonb_build_object(
    'concepts', coalesce((select jsonb_agg(jsonb_build_object('concept_id', c.concept_id, 'code', c.code, 'name', c.name,
        'icon', c.icon, 'description', c.description) order by c.sort_order, c.name)
      from public.service_concepts c where c.is_active and c.input_mode = 'toggle'), '[]'::jsonb),
    'selected', to_jsonb(v_selected));
end $function$;
