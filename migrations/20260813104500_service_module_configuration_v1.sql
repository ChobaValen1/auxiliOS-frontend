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

do $$
begin
  if not exists (select 1 from pg_trigger where tgname='service_module_settings_audit') then
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
  v_row public.service_module_settings%rowtype;
begin
  if v_role<>'administracion' then
    raise exception 'Solo Administración puede modificar la configuración de Servicios';
  end if;
  update public.service_module_settings
  set column_order=coalesce(p_config->'column_order',column_order),
      column_visibility=(coalesce(p_config->'column_visibility',column_visibility)||jsonb_build_object('service',true,'actions',true)),
      field_modes=coalesce(p_config->'field_modes',field_modes),
      workflow=coalesce(p_config->'workflow',workflow),
      updated_at=now(),
      updated_by=auth.uid()
  where settings_key='default'
  returning * into v_row;
  return jsonb_build_object(
    'column_order',v_row.column_order,
    'column_visibility',v_row.column_visibility,
    'field_modes',v_row.field_modes,
    'workflow',v_row.workflow,
    'updated_at',v_row.updated_at
  );
end;
$$;

revoke all on function public.get_service_module_configuration() from public,anon;
revoke all on function public.save_service_module_configuration(jsonb) from public,anon;
grant execute on function public.get_service_module_configuration() to authenticated;
grant execute on function public.save_service_module_configuration(jsonb) to authenticated;

alter table public.operator_services
  add column if not exists billing_status text not null default 'not_ready';

update public.operator_services
set billing_status='pending'
where status='completed' and billing_status='not_ready';

-- Se reutiliza el trigger BEFORE UPDATE existente de operator_services.
-- No se crea otro trigger en paralelo: al finalizar, el mismo registro queda
-- fuera de la mesa activa y preparado para la futura cola de Facturación.
create or replace function app_private.operator_services_before_update()
returns trigger
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $$
declare
  v_role text := app_private.current_auxilios_role();
  v_bridge boolean := coalesce(current_setting('app.phase3_bridge', true), '') = '1';
begin
  if new.status='completed' and old.status is distinct from 'completed' then
    new.billing_status:='pending';
  end if;

  if v_bridge then
    new.updated_at := now();
    new.updated_by := coalesce(new.updated_by, auth.uid(), old.updated_by);
    return new;
  end if;

  if v_role = 'chofer' then
    if old.assigned_driver_id is distinct from auth.uid() then
      raise exception 'Servicio no asignado al chofer actual';
    end if;
    if (to_jsonb(new) - array['status','driver_notes','billing_status','updated_at','updated_by'])
       is distinct from
       (to_jsonb(old) - array['status','driver_notes','billing_status','updated_at','updated_by']) then
      raise exception 'El chofer solo puede avanzar el estado y registrar una nota';
    end if;
    if not (
      (old.status='assigned' and new.status='en_route') or
      (old.status='en_route' and new.status='at_origin') or
      (old.status='at_origin' and new.status='loaded') or
      (old.status='loaded' and new.status='at_destination') or
      (old.status='at_destination' and new.status='completed') or
      old.status=new.status
    ) then
      raise exception 'Transición de estado no permitida';
    end if;
  end if;

  if new.status='cancelled' and old.status<>'cancelled' then
    new.cancelled_at:=coalesce(new.cancelled_at,now());
  elsif new.status<>'cancelled' then
    new.cancelled_at:=null;
  end if;
  if new.status='completed' and old.status<>'completed' then
    new.completed_at:=coalesce(new.completed_at,now());
  end if;
  if new.assigned_driver_id is not null and (
    old.assigned_driver_id is distinct from new.assigned_driver_id or
    old.assigned_truck_id is distinct from new.assigned_truck_id
  ) then
    new.assigned_at:=now();
    if v_role in ('administracion','operador','supervision') then
      new.assigned_by:=auth.uid();
    end if;
  end if;
  new.updated_at:=now();
  new.updated_by:=coalesce(auth.uid(),old.updated_by);
  return new;
end;
$$;
