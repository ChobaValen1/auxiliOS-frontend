-- AuxiliOS · Tarifario V3 · actualizaciones/importaciones masivas atómicas

create or replace function public.bulk_save_company_tariff_rates_v3(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $$
declare
  v_rates jsonb:=coalesce(p_payload->'rates','[]'::jsonb);
  v_item jsonb;
  v_result jsonb;
  v_results jsonb:='[]'::jsonb;
  v_count integer;
begin
  if app_private.current_auxilios_role()<>'administracion' then
    raise exception 'Solo Administración puede actualizar tarifas en forma masiva';
  end if;
  if jsonb_typeof(v_rates)<>'array' then
    raise exception 'El lote de tarifas debe ser un array';
  end if;
  v_count:=jsonb_array_length(v_rates);
  if v_count<1 then raise exception 'El lote de tarifas está vacío'; end if;
  if v_count>500 then raise exception 'El lote supera el máximo de 500 tarifas'; end if;

  for v_item in select value from jsonb_array_elements(v_rates)
  loop
    if jsonb_typeof(v_item)<>'object' then raise exception 'Cada tarifa del lote debe ser un objeto'; end if;
    v_result:=public.save_company_tariff_rate_v3(v_item);
    v_results:=v_results||jsonb_build_array(v_result);
  end loop;

  return jsonb_build_object('count',v_count,'rates',v_results);
end $$;

revoke all on function public.bulk_save_company_tariff_rates_v3(jsonb) from public,anon;
grant execute on function public.bulk_save_company_tariff_rates_v3(jsonb) to authenticated;

comment on function public.bulk_save_company_tariff_rates_v3(jsonb) is
'Aplica un lote de nuevas vigencias de tarifario V3 en una sola transacción. Si una tarifa falla, se revierte el lote completo.';
