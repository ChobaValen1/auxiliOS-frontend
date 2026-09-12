-- Expone al Chofer únicamente los modos de los campos del remito mediante el
-- RPC de capacidades existente. La tabla de configuración continúa revocada.
update public.service_module_settings
set field_modes = field_modes || jsonb_build_object(
  'customer_document','optional',
  'customer_phone','optional'
)
where settings_key='default';

create or replace function public.get_driver_remito_capabilities_v2()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_modes jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sesión requerida';
  end if;

  select jsonb_build_object(
    'customer_document',case when field_modes->>'customer_document' in ('required','optional','hidden') then field_modes->>'customer_document' else 'optional' end,
    'customer_phone',case when field_modes->>'customer_phone' in ('required','optional','hidden') then field_modes->>'customer_phone' else 'optional' end
  )
  into v_modes
  from public.service_module_settings
  where settings_key='default';

  return jsonb_build_object(
    'version',2,
    'assigned',to_regprocedure('public.save_driver_operator_service_remito_v4(uuid,jsonb,uuid)') is not null,
    'ad_hoc',to_regprocedure('public.save_driver_ad_hoc_remito_v2(jsonb,uuid)') is not null,
    'structured_addons',true,
    'private_evidence',true,
    'field_modes',coalesce(v_modes,jsonb_build_object('customer_document','optional','customer_phone','optional'))
  );
end;
$function$;

revoke all on function public.get_driver_remito_capabilities_v2() from public,anon;
grant execute on function public.get_driver_remito_capabilities_v2() to authenticated,service_role;
