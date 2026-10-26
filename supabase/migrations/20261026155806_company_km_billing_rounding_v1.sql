-- Optional company billing rule, default preserves decimal kilometres.
-- Only the *_km_v1 preview endpoints opt in. Existing clients keep the old price path.
alter table public.company_billing_settings
 add column if not exists km_rounding_mode text not null default 'decimal' check(km_rounding_mode in ('decimal','nearest_integer'));

create or replace function app_private.round_billable_km_v1(p_asphalt numeric,p_gravel numeric,p_mode text,p_scope text)
returns jsonb language plpgsql immutable set search_path='' as $f$
declare a numeric:=coalesce(p_asphalt,0); g numeric:=coalesce(p_gravel,0); ra numeric; rg numeric;
begin
 if a<0 or g<0 or a::text in ('NaN','Infinity') or g::text in ('NaN','Infinity') then raise exception 'Kilómetros inválidos'; end if;
 if p_mode is null or p_mode not in ('decimal','nearest_integer') or p_scope is null or p_scope<>'per_terrain' then raise exception 'Regla de redondeo inválida'; end if;
 if p_mode='decimal' then ra:=a;rg:=g;else ra:=round(a);rg:=round(g);end if;
 return jsonb_build_object('asphalt',ra,'gravel',rg,'total',ra+rg,'raw_asphalt',a,'raw_gravel',g,'raw_total',a+g);
end $f$;
revoke all on function app_private.round_billable_km_v1(numeric,numeric,text,text) from public,anon,authenticated;

-- Keep the tariff, covered-radius, movement, surcharges and copay calculations.
-- Round after the coverage calculation and before multiplying by the km prices.
do $mig$
declare d text; n text; sig text:='uuid,uuid,timestamptz,uuid,jsonb,numeric,numeric,numeric,boolean';
begin
 d:=replace(pg_get_functiondef(('app_private.calculate_operator_service_quote_v4_full('||sig||')')::regprocedure),E'\r','');
 if to_regprocedure('app_private.calculate_operator_service_quote_v5_km_full('||sig||')') is null then
  n:=replace(d,'app_private.calculate_operator_service_quote_v4_full(', 'app_private.calculate_operator_service_quote_v5_km_full(');
  if position('  IF v_movement_applies THEN' in n)=0 or position('  v_unit_source text;' in n)=0 or position('''covered_radius_km'',v_radius' in n)=0 then raise exception 'El motor de tarifas cambió; revisar antes de habilitar redondeo'; end if;
  n:=replace(n,'  v_unit_source text;', E'  v_unit_source text;\n  v_km jsonb;\n  v_km_mode text;\n  v_km_scope text;');
  n:=replace(n,'  IF v_movement_applies THEN', $block$
  v_km_mode:=coalesce(v_setting.km_rounding_mode,'decimal');
  v_km_scope:='per_terrain';
  v_km:=app_private.round_billable_km_v1(v_billable_asphalt,v_billable_gravel,v_km_mode,v_km_scope);
  v_billable_asphalt:=(v_km->>'asphalt')::numeric;
  v_billable_gravel:=(v_km->>'gravel')::numeric;
  v_billable_distance:=(v_km->>'total')::numeric;
  v_distance_applies:=v_primary.distance_chargeable and v_billable_distance>0;
  IF v_movement_applies THEN$block$);
  n:=replace(n,'''covered_radius_km'',v_radius', $meta$'km_rounding_mode',v_km_mode,'km_rounding_scope',v_km_scope,
    'billable_distance_km_before_rounding',v_km->'raw_total',
    'billable_asphalt_km_before_rounding',v_km->'raw_asphalt','billable_gravel_km_before_rounding',v_km->'raw_gravel',
    'covered_radius_km',v_radius$meta$);
  execute n;
 end if;
 if position('app.km_rounding_preview' in d)=0 then
  n:=replace(d,E'BEGIN\n',$route$BEGIN
  IF coalesce(current_setting('app.km_rounding_preview',true),'')='1' THEN
    RETURN app_private.calculate_operator_service_quote_v5_km_full(p_company_id,p_base_id,p_scheduled_for,p_primary_concept_id,p_items,p_asphalt_km,p_gravel_km,p_toll_amount,p_is_holiday);
  END IF;
$route$);
  if n=d then raise exception 'No se pudo aislar el motor de redondeo'; end if;
  execute n;
 end if;
end $mig$;
revoke all on function app_private.calculate_operator_service_quote_v5_km_full(uuid,uuid,timestamptz,uuid,jsonb,numeric,numeric,numeric,boolean) from public,anon,authenticated;

create or replace function public.get_company_billing_configuration_km_v1(p_company_id uuid,p_scheduled_for timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path='' as $f$
declare d jsonb; s public.company_billing_settings%rowtype;
begin
 if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'') not in ('administracion','operador','supervision','facturacion') then raise exception 'Sin permiso para consultar reglas de facturación'; end if;
 d:=public.get_company_billing_configuration(p_company_id,p_scheduled_for);
 select * into s from public.company_billing_settings where billing_setting_id=nullif(d#>>'{setting,billing_setting_id}','')::uuid;
 if found then d:=jsonb_set(d,'{setting}',d->'setting'||jsonb_build_object('km_rounding_mode',s.km_rounding_mode,'km_rounding_scope','per_terrain')); end if;
 return d;
end $f$;
revoke all on function public.get_company_billing_configuration_km_v1(uuid,timestamptz) from public,anon;
grant execute on function public.get_company_billing_configuration_km_v1(uuid,timestamptz) to authenticated;

create or replace function public.save_company_billing_configuration_km_v1(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $f$
declare d jsonb; id uuid:=nullif(p_payload->>'billing_setting_id','')::uuid; company uuid:=(p_payload->>'company_id')::uuid;
 mode text:=coalesce(p_payload->>'km_rounding_mode','decimal'); scope text:=coalesce(p_payload->>'km_rounding_scope','per_terrain');
begin
 if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'')<>'administracion' then raise exception 'Solo Administración puede modificar las reglas de facturación'; end if;
 if mode not in ('decimal','nearest_integer') or scope<>'per_terrain' then raise exception 'Regla de redondeo inválida'; end if;
 d:=public.save_company_billing_configuration(p_payload);
 if id is null then
  select billing_setting_id into strict id from public.company_billing_settings
   where company_id=company and created_at=now() and valid_from=(p_payload->>'valid_from')::date;
 end if;
 update public.company_billing_settings set km_rounding_mode=mode,updated_at=now(),updated_by=auth.uid()
 where billing_setting_id=id and company_id=company;
 if not found then raise exception 'No se pudo guardar la regla de kilómetros'; end if;
 return public.get_company_billing_configuration_km_v1(company,now());
end $f$;
revoke all on function public.save_company_billing_configuration_km_v1(jsonb) from public,anon;
grant execute on function public.save_company_billing_configuration_km_v1(jsonb) to authenticated;

-- Reuse the established permission checks and full transactions, including invoice
-- snapshot creation. Restore the opt-in marker after success or error.
do $mig$
declare name text; p record; args text; body text; new_name text;
begin
 foreach name in array array[
 'calculate_operator_service_quote_v3','create_operator_service_v4','update_operator_service_v4',
 'update_operator_billing_service_v2','save_operator_review_workspace_v1',
 'create_and_finalize_driver_service_intake_v1','create_finalize_activated_intake_v1',
 'finalize_operator_service_at_v1','activate_and_finalize_service_v2',
 'list_operator_billing_services_v3','list_operator_billing_private_v1',
 'get_operator_billing_service_detail_v4','get_operator_billing_export_rows_v2','create_operator_invoice_v4',
 'review_operator_billing_service_v2','review_operator_billing_services_bulk_v2'
 ] loop
  select x.*,pg_get_function_arguments(x.oid) declarations,pg_get_function_identity_arguments(x.oid) identity_args into strict p
   from pg_proc x join pg_namespace n on n.oid=x.pronamespace where n.nspname='public' and x.proname=name;
  if p.prorettype<>'jsonb'::regtype then raise exception 'Contrato inesperado para %',name; end if;
  select string_agg(quote_ident(a),',' order by ord) into args from unnest(p.proargnames[1:p.pronargs]) with ordinality as x(a,ord);
  new_name:=name||'_km_v1';
  body:=format($body$declare previous text:=coalesce(current_setting('app.km_rounding_preview',true),''); result jsonb;
  begin
   if auth.uid() is null then raise exception 'Sin sesión'; end if;
   perform set_config('app.km_rounding_preview','1',true);
   begin result:=public.%I(%s);
   exception when others then perform set_config('app.km_rounding_preview',previous,true);raise;end;
   perform set_config('app.km_rounding_preview',previous,true);return result;
  end;$body$,name,coalesce(args,''));
  execute format('create or replace function public.%I(%s) returns jsonb language plpgsql security invoker set search_path='''' as %L',new_name,p.declarations,body);
  execute format('revoke all on function public.%I(%s) from public,anon',new_name,p.identity_args);
  execute format('grant execute on function public.%I(%s) to authenticated',new_name,p.identity_args);
 end loop;
end $mig$;
