-- AuxiliOS · Facturación · F0+F1 · compatibilidad de instalación limpia

alter table public.operator_service_events
  add column if not exists details jsonb not null default '{}'::jsonb;

create or replace function app_private.operator_service_billing_sync_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
begin
  if tg_op='INSERT' then
    if new.status in ('completed','cancelled') then
      perform app_private.sync_operator_service_billing_v1(new.service_id);
    end if;
    return new;
  end if;

  if new.status in ('completed','cancelled')
     and (new.status is distinct from old.status or new.billing_status is distinct from old.billing_status) then
    perform app_private.sync_operator_service_billing_v1(new.service_id);
  end if;

  return new;
end;
$function$;

create or replace function app_private.operator_service_closure_billing_sync_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
begin
  if tg_op='INSERT' then
    perform app_private.sync_operator_service_billing_v1(new.service_id);
    return new;
  end if;

  if new.billing_status is distinct from old.billing_status then
    perform app_private.sync_operator_service_billing_v1(new.service_id);
  end if;

  return new;
end;
$function$;

revoke all on function app_private.operator_service_billing_sync_trigger_v1() from public,anon,authenticated;
revoke all on function app_private.operator_service_closure_billing_sync_trigger_v1() from public,anon,authenticated;
