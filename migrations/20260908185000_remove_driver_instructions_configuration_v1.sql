-- Retire the unused driver-instructions setting without deleting historical service data.
alter table public.service_module_settings
  drop constraint if exists service_module_settings_field_modes_check;

update public.service_module_settings
set field_modes=field_modes-'driver_instructions',
    updated_at=now()
where field_modes ? 'driver_instructions';

alter table public.service_module_settings
  add constraint service_module_settings_field_modes_check check (
    coalesce(field_modes->>'customer_name','') in ('required','optional','hidden') and
    coalesce(field_modes->>'customer_phone','') in ('required','optional','hidden') and
    coalesce(field_modes->>'customer_email','') in ('required','optional','hidden') and
    coalesce(field_modes->>'vehicle_plate','') in ('required','optional','hidden') and
    coalesce(field_modes->>'vehicle_make_model','') in ('required','optional','hidden') and
    coalesce(field_modes->>'assigned_resources','') in ('required','optional','hidden') and
    coalesce(field_modes->>'purchase_order_number','') in ('required','optional','hidden') and
    coalesce(field_modes->>'operator_notes','') in ('required','optional','hidden')
  );
