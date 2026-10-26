-- Isolated fixture for the real tariff engine; no customer data.
create role anon;create role authenticated;create schema auth;create schema app_private;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function app_private.current_auxilios_role() returns text language sql as $$select coalesce(nullif(current_setting('test.role',true),''),'administracion')$$;
create table company_contracts(contract_id uuid primary key,company_id uuid,status text,valid_from date,valid_until date,is_primary boolean,created_at timestamptz default now(),name text);
create table company_rate_cards(rate_card_id uuid primary key,contract_id uuid,status text,valid_from date,valid_until date,version integer,currency text,name text);
create table service_concepts(concept_id uuid primary key,code text,name text,is_active boolean,billing_family text,service_category text,distance_chargeable boolean,default_pricing_unit text);
create table company_service_settings(company_id uuid,concept_id uuid,is_enabled boolean,code_mode text,price_link text);
create table company_rate_items(rate_item_id uuid primary key,rate_card_id uuid,concept_id uuid,is_active boolean,branch_id uuid,billing_base_id uuid,asphalt_km_price numeric,gravel_km_price numeric,extra_km_price numeric,primary_price numeric,base_price numeric,secondary_price numeric,pricing_unit text);
create table company_rate_rules(rule_id uuid default gen_random_uuid(),rate_card_id uuid,enabled boolean,rule_type text,amount numeric,calculation_mode text,start_time time,end_time time,saturday_start time,saturday_end time,sunday_holiday_start time,sunday_holiday_end time,distance_threshold_km numeric);
create table company_rate_rule_exceptions(rule_id uuid,concept_id uuid);
create table company_rate_billing_settings(rate_card_id uuid,toll_enabled boolean,toll_invoice_enabled boolean,toll_mode text,toll_fixed_amount numeric,copay_enabled boolean,copay_mode text,copay_value numeric);
create table company_billing_settings(billing_setting_id uuid default gen_random_uuid() primary key,company_id uuid,contract_id uuid,is_active boolean default true,valid_from date,valid_until date,created_at timestamptz default now(),updated_at timestamptz default now(),updated_by uuid,covered_radius_km numeric,movement_charge_until_km numeric);
create table service_categories(category_id uuid,legacy_primary_concept_id uuid,is_active boolean,sort_order integer);
create function public.get_company_billing_configuration(p_company_id uuid,p_scheduled_for timestamptz default now()) returns jsonb language sql as $$select jsonb_build_object('setting',to_jsonb(s)) from public.company_billing_settings s where s.company_id=p_company_id and s.valid_from<=p_scheduled_for::date order by s.created_at desc limit 1$$;
create function public.save_company_billing_configuration(p_payload jsonb) returns jsonb language plpgsql set search_path=public as $$
begin
 if app_private.current_auxilios_role()<>'administracion' then raise exception 'Sin permiso';end if;
 if nullif(p_payload->>'billing_setting_id','') is null then insert into company_billing_settings(company_id,valid_from,contract_id) values((p_payload->>'company_id')::uuid,(p_payload->>'valid_from')::date,(p_payload->>'contract_id')::uuid);
 else update company_billing_settings set covered_radius_km=nullif(p_payload->>'covered_radius_km','')::numeric where billing_setting_id=(p_payload->>'billing_setting_id')::uuid;end if;
 return public.get_company_billing_configuration((p_payload->>'company_id')::uuid,now());
end$$;
