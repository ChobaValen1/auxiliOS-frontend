-- AuxiliOS · Configuración canónica del módulo Servicios
-- Panel, formulario de alta y preparación para Historial/Facturación.

create table if not exists public.service_module_settings (
  settings_key text primary key default 'default',
  column_order jsonb not null default '["service","date","route","customer_vehicle","resource","status","base","km","priority","updated","actions"]'::jsonb,
  column_visibility jsonb not null default '{"service":true,"date":true,"route":true,"customer_vehicle":true,"resource":true,"status":true,"base":false,"km":false,"priority":false,"updated":false,"actions":true}'::jsonb,
  field_modes jsonb not null default '{"customer_name":"optional","customer_phone":"required","customer_email":"hidden","vehicle_plate":"optional","vehicle_make_model":"optional","assigned_resources":"optional","purchase_order_number":"hidden","operator_notes":"optional","driver_instructions":"optional"}'::jsonb,
  workflow jsonb not null default '{"show_cancelled_in_history":true,"allow_personal_column_overrides":true}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid null references public.users(user_id)
);

insert into public.service_module_settings(settings_key)
values ('default')
on conflict (settings_key) do nothing;

do $$ begin
  if not exists (
    select 1 from pg_trigger where tgname='service_module_settings_audit'
  ) then
    create trigger service_module_settings_audit
    after insert or update or delete on public.service_module_settings
    for each row execute function public.capture_audit_event('settings_key');
  end if;
end $$;

create or replace function public.get_service_module_configuration()
returns jsonb
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $$
declare
  v_role text:=app_private.current_auxilios_role();
  v_row public.service_module_settings%rowtype;
begin
  if v_role not in ('administracion','operador','supervision','facturacion') then
    raise exception 'Sin permiso para consultar la configuración de Servicios';
  end if;
  select * into v_row from public.service_module_settings where settings_key='default';
  return jsonb_build_object(
    'column_order',v_row.column_order,
    'column_visibility',v_row.column_visibility,
    'field_modes',v_row.field_modes,
    'workflow',v_row.workflow,
    'updated_at',v_row.updated_at
  );
end;
$$;

create or replace function public.save_service_module_configuration(p_config jsonb)
returns jsonb
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $$
declare
  v_role text:=app_private.current_auxilios_role();
  v_uid uuid:=auth.uid();
  v_current public.service_module_settings%rowtype;
  v_order jsonb;
  v_visibility jsonb;
  v_modes jsonb;
  v_workflow jsonb;
  v_allowed_columns text[]:=array['service','date','route','customer_vehicle','resource','status','base','km','priority','updated','actions'];
  v_allowed_fields text[]:=array['customer_name','customer_phone','customer_email','vehicle_plate','vehicle_make_model','assigned_resources','purchase_order_number','operator_notes','driver_instructions'];
  v_value text;
  v_key text;
begin
  if v_role<>'administracion' then raise exception 'Solo Administración puede modificar la configuración de Servicios'; end if;
  select * into v_current from public.service_module_settings where settings_key='default' for update;

  v_order:=coalesce(p_config->'column_order',v_current.column_order);
  if jsonb_typeof(v_order)<>'array' or jsonb_array_length(v_order)<>cardinality(v_allowed_columns) then
    raise exception 'El orden de columnas es inválido';
  end if;
  if exists(
    select 1 from jsonb_array_elements_text(v_order) x(value)
    where not (x.value=any(v_allowed_columns))
  ) or (select count(distinct x.value) from jsonb_array_elements_text(v_order) x(value))<>cardinality(v_allowed_columns) then
    raise exception 'El orden de columnas contiene valores inválidos o repetidos';
  end if;

  v_visibility:=coalesce(p_config->'column_visibility',v_current.column_visibility);
  if jsonb_typeof(v_visibility)<>'object' then raise exception 'La visibilidad de columnas es inválida'; end if;
  v_visibility:=v_visibility||jsonb_build_object('service',true,'actions',true);

  v_modes:=coalesce(p_config->'field_modes',v_current.field_modes);
  if jsonb_typeof(v_modes)<>'object' then raise exception 'La configuración de campos es inválida'; end if;
  for v_key,v_value in select key,value #>> '{}' from jsonb_each(v_modes) loop
    if not (v_key=any(v_allowed_fields)) then raise exception 'Campo configurable inválido: %',v_key; end if;
    if v_value not in ('required','optional','hidden') then raise exception 'Modo inválido para %',v_key; end if;
  end loop;

  v_workflow:=coalesce(p_config->'workflow',v_current.workflow);
  if jsonb_typeof(v_workflow)<>'object' then raise exception 'La configuración de flujo es inválida'; end if;
  v_workflow:=jsonb_build_object(
    'show_cancelled_in_history',coalesce((v_workflow->>'show_cancelled_in_history')::boolean,true),
    'allow_personal_column_overrides',coalesce((v_workflow->>'allow_personal_column_overrides')::boolean,true)
  );

  update public.service_module_settings
  set column_order=v_order,column_visibility=v_visibility,field_modes=v_modes,workflow=v_workflow,updated_at=now(),updated_by=v_uid
  where settings_key='default'
  returning * into v_current;

  return jsonb_build_object(
    'column_order',v_current.column_order,
    'column_visibility',v_current.column_visibility,
    'field_modes',v_current.field_modes,
    'workflow',v_current.workflow,
    'updated_at',v_current.updated_at
  );
end;
$$;

revoke all on function public.get_service_module_configuration() from public,anon;
revoke all on function public.save_service_module_configuration(jsonb) from public,anon;
grant execute on function public.get_service_module_configuration() to authenticated;
grant execute on function public.save_service_module_configuration(jsonb) to authenticated;

alter table public.operator_services add column if not exists billing_status text not null default 'not_ready';

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname='operator_services_billing_status_check'
  ) then
    alter table public.operator_services add constraint operator_services_billing_status_check
      check (billing_status in ('not_ready','pending','reviewed','invoiced','excluded'));
  end if;
end $$;

update public.operator_services set billing_status='pending' where status='completed' and billing_status='not_ready';

create or replace function app_private.sync_operator_service_billing_status()
returns trigger
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $$
begin
  if new.status='completed' and (tg_op='INSERT' or old.status is distinct from new.status) then
    new.billing_status:='pending';
  end if;
  return new;
end;
$$;

drop trigger if exists operator_services_billing_status_sync on public.operator_services;
create trigger operator_services_billing_status_sync
before insert or update of status on public.operator_services
for each row execute function app_private.sync_operator_service_billing_status();
