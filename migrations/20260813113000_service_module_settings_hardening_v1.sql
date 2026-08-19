-- AuxiliOS · Hardening de Configuración de Servicios
alter table public.service_module_settings enable row level security;
revoke all on table public.service_module_settings from public,anon,authenticated;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='service_module_settings_column_order_check') then
    alter table public.service_module_settings add constraint service_module_settings_column_order_check check (
      jsonb_typeof(column_order)='array' and jsonb_array_length(column_order)=11 and
      column_order ? 'service' and column_order ? 'date' and column_order ? 'route' and
      column_order ? 'customer_vehicle' and column_order ? 'resource' and column_order ? 'status' and
      column_order ? 'base' and column_order ? 'km' and column_order ? 'priority' and
      column_order ? 'updated' and column_order ? 'actions'
    );
  end if;
  if not exists (select 1 from pg_constraint where conname='service_module_settings_json_shapes_check') then
    alter table public.service_module_settings add constraint service_module_settings_json_shapes_check check (
      jsonb_typeof(column_visibility)='object' and jsonb_typeof(field_modes)='object' and jsonb_typeof(workflow)='object'
    );
  end if;
  if not exists (select 1 from pg_constraint where conname='service_module_settings_field_modes_check') then
    alter table public.service_module_settings add constraint service_module_settings_field_modes_check check (
      coalesce(field_modes->>'customer_name','') in ('required','optional','hidden') and
      coalesce(field_modes->>'customer_phone','') in ('required','optional','hidden') and
      coalesce(field_modes->>'customer_email','') in ('required','optional','hidden') and
      coalesce(field_modes->>'vehicle_plate','') in ('required','optional','hidden') and
      coalesce(field_modes->>'vehicle_make_model','') in ('required','optional','hidden') and
      coalesce(field_modes->>'assigned_resources','') in ('required','optional','hidden') and
      coalesce(field_modes->>'purchase_order_number','') in ('required','optional','hidden') and
      coalesce(field_modes->>'operator_notes','') in ('required','optional','hidden') and
      coalesce(field_modes->>'driver_instructions','') in ('required','optional','hidden')
    );
  end if;
  if not exists (select 1 from pg_constraint where conname='operator_services_billing_status_check') then
    alter table public.operator_services add constraint operator_services_billing_status_check check (
      billing_status in ('not_ready','pending','reviewed','invoiced','excluded')
    );
  end if;
end $$;
