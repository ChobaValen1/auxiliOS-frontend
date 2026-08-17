-- AuxiliOS · Facturación · persistencia de tratamiento contractual de peajes.

create or replace function public.save_company_billing_configuration(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $function$
declare
  v_role text:=app_private.current_auxilios_role();
  v_id uuid:=nullif(p_payload->>'billing_setting_id','')::uuid;
  v_company uuid:=nullif(p_payload->>'company_id','')::uuid;
  v_contract uuid:=nullif(p_payload->>'contract_id','')::uuid;
  v_from date:=coalesce(nullif(p_payload->>'valid_from','')::date,current_date);
  v_until date:=nullif(p_payload->>'valid_until','')::date;
  v_active boolean:=coalesce((p_payload->>'is_active')::boolean,true);
  v_radius numeric:=nullif(p_payload->>'covered_radius_km','')::numeric;
  v_movement_until numeric:=nullif(p_payload->>'movement_charge_until_km','')::numeric;
  v_toll_billing_mode text:=coalesce(nullif(p_payload->>'toll_billing_mode',''),'with_service');
  v_bases jsonb:=coalesce(p_payload->'bases','[]'::jsonb);
  v_entry jsonb;
  v_saved public.company_billing_settings%rowtype;
begin
  if v_role<>'administracion' then raise exception 'Solo Administración puede modificar la configuración de facturación'; end if;
  if v_company is null or not exists(select 1 from public.companies where company_id=v_company) then raise exception 'Seleccioná una empresa válida'; end if;
  if v_contract is not null and not exists(select 1 from public.company_contracts where contract_id=v_contract and company_id=v_company) then raise exception 'El contrato no pertenece a la empresa'; end if;
  if v_until is not null and v_until<v_from then raise exception 'La fecha hasta no puede ser anterior a la fecha desde'; end if;
  if v_radius is not null and v_radius<0 then raise exception 'El radio cubierto no puede ser negativo'; end if;
  if v_movement_until is not null and v_movement_until<0 then raise exception 'El límite de movida no puede ser negativo'; end if;
  if v_radius is not null and v_movement_until is not null and v_movement_until<v_radius then raise exception 'Cobrar movida hasta debe ser igual o mayor que el radio cubierto'; end if;
  if v_toll_billing_mode not in ('with_service','separate') then raise exception 'Modo de facturación de peajes inválido'; end if;
  if v_active and jsonb_array_length(v_bases)=0 then raise exception 'Una configuración activa debe tener al menos una base aplicable'; end if;

  if v_id is null then
    insert into public.company_billing_settings(
      company_id,contract_id,route_mode,toll_calculation_mode,toll_billing_mode,
      covered_radius_km,movement_charge_until_km,valid_from,valid_until,
      requires_verified_base,is_active,notes,created_by,updated_by
    ) values(
      v_company,v_contract,
      coalesce(nullif(p_payload->>'route_mode',''),'base_origin_destination_base'),
      coalesce(nullif(p_payload->>'toll_calculation_mode',''),'route_estimate'),
      v_toll_billing_mode,v_radius,v_movement_until,v_from,v_until,
      coalesce((p_payload->>'requires_verified_base')::boolean,true),v_active,
      nullif(btrim(p_payload->>'notes'),''),auth.uid(),auth.uid()
    ) returning * into v_saved;
  else
    select * into v_saved from public.company_billing_settings where billing_setting_id=v_id;
    if not found then raise exception 'Configuración inexistente'; end if;
    if v_saved.company_id<>v_company then raise exception 'No se puede cambiar la empresa de la configuración'; end if;
    update public.company_billing_settings set
      contract_id=v_contract,
      route_mode=coalesce(nullif(p_payload->>'route_mode',''),'base_origin_destination_base'),
      toll_calculation_mode=coalesce(nullif(p_payload->>'toll_calculation_mode',''),'route_estimate'),
      toll_billing_mode=v_toll_billing_mode,
      covered_radius_km=v_radius,
      movement_charge_until_km=v_movement_until,
      valid_from=v_from,
      valid_until=v_until,
      requires_verified_base=coalesce((p_payload->>'requires_verified_base')::boolean,true),
      is_active=v_active,
      notes=nullif(btrim(p_payload->>'notes'),''),
      updated_by=auth.uid()
    where billing_setting_id=v_id
    returning * into v_saved;
  end if;

  delete from public.company_billing_base_links where billing_setting_id=v_saved.billing_setting_id;
  for v_entry in select value from jsonb_array_elements(v_bases)
  loop
    if nullif(v_entry->>'base_id','') is null or not exists(select 1 from public.billing_bases b where b.base_id=(v_entry->>'base_id')::uuid) then raise exception 'Una de las bases seleccionadas no existe'; end if;
    insert into public.company_billing_base_links(
      billing_setting_id,base_id,is_primary,priority,is_active,notes,created_by,updated_by
    ) values(
      v_saved.billing_setting_id,(v_entry->>'base_id')::uuid,false,100,
      coalesce((v_entry->>'is_active')::boolean,true),nullif(btrim(v_entry->>'notes'),''),auth.uid(),auth.uid()
    );
  end loop;
  return public.get_company_billing_configuration(v_company,now());
end;
$function$;
