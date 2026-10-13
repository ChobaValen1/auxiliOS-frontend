-- Reglas de campos propias del chofer (Configuración › Servicios › columna Chofer).
-- Se guardan dentro de service_module_settings.field_modes->'driver'. Si no existen,
-- se mantiene el comportamiento anterior: DNI/CUIT con la regla del operador y
-- teléfono obligatorio (con la opción "El cliente no informa teléfono").
create or replace function public.get_driver_remito_capabilities_v2()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  v_all jsonb;
  v_driver jsonb;
  v_modes jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sesión requerida';
  end if;

  select coalesce(field_modes,'{}'::jsonb) into v_all
  from public.service_module_settings
  where settings_key='default';
  v_all := coalesce(v_all,'{}'::jsonb);
  v_driver := coalesce(v_all->'driver','{}'::jsonb);

  v_modes := jsonb_build_object(
    'customer_document',case
      when v_driver->>'customer_document' in ('required','optional','hidden') then v_driver->>'customer_document'
      when v_all->>'customer_document' in ('required','optional','hidden') then v_all->>'customer_document'
      else 'optional' end,
    'customer_phone',case when v_driver->>'customer_phone'='optional' then 'optional' else 'required' end
  );

  return jsonb_build_object(
    'version',2,
    'assigned',to_regprocedure('public.save_driver_operator_service_remito_v4(uuid,jsonb,uuid)') is not null,
    'ad_hoc',to_regprocedure('public.save_driver_ad_hoc_remito_v2(jsonb,uuid)') is not null,
    'structured_addons',true,
    'private_evidence',true,
    'field_modes',v_modes
  );
end;
$function$;

create or replace function app_private.prepare_driver_customer_payload_v1(p_payload jsonb, p_saved jsonb, p_service jsonb default '{}'::jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_payload jsonb:=coalesce(p_payload,'{}'::jsonb);
  v_all jsonb;
  v_key text;
  v_field text;
  v_mode text;
  v_value text;
begin
  select coalesce(field_modes,'{}'::jsonb) into v_all from public.service_module_settings where settings_key='default';
  v_all := coalesce(v_all,'{}'::jsonb);
  foreach v_key in array array['cuit','telefono'] loop
    v_field:=case v_key when 'cuit' then 'customer_document' else 'customer_phone' end;
    if v_key='cuit' then
      v_mode:=coalesce(v_all->'driver'->>'customer_document',v_all->>'customer_document','optional');
    else
      /* El teléfono lo controla la pantalla del chofer, que permite "El cliente no informa teléfono". */
      v_mode:='optional';
    end if;
    v_value:=coalesce(p_saved->>v_key,p_service->>v_field);
    if v_mode='hidden' then
      v_payload:=v_payload||jsonb_build_object(v_key,coalesce(v_value,v_payload->>v_key));
    elsif not (v_payload ? v_key) or v_payload->v_key='null'::jsonb then
      v_payload:=v_payload||jsonb_build_object(v_key,v_value);
    end if;
    if v_payload->>'status'='firmado' and v_mode='required'
       and nullif(btrim(v_payload->>v_key),'') is null then
      raise exception 'Completá % antes de firmar',case v_key when 'cuit' then 'DNI/CUIT' else 'el teléfono del socio' end;
    end if;
  end loop;
  return v_payload;
end;
$function$;
