do $$
declare p record;
begin
  for p in select schemaname,tablename,policyname from pg_policies where schemaname='public' and tablename in ('fuel_records','incidents','remitos','trips') loop
    execute format('drop policy if exists %I on %I.%I',p.policyname,p.schemaname,p.tablename);
  end loop;
end $$;

alter table public.fuel_records enable row level security;
alter table public.incidents enable row level security;
alter table public.remitos enable row level security;
alter table public.trips enable row level security;

revoke all on public.fuel_records,public.incidents,public.remitos,public.trips from anon,authenticated;
grant select,insert,update,delete on public.fuel_records,public.incidents,public.remitos to authenticated;

create index if not exists idx_fuel_records_log_id on public.fuel_records(log_id);
create index if not exists idx_incidents_driver_id on public.incidents(driver_id);
create index if not exists idx_remitos_driver_id on public.remitos(driver_id);

create policy fuel_select_management on public.fuel_records for select to authenticated using ((select public.current_auxilios_role()) in ('administracion','supervision'));
create policy fuel_select_driver_own on public.fuel_records for select to authenticated using (exists(select 1 from public.daily_logs d where d.log_id=fuel_records.log_id and d.driver_id=(select auth.uid())));
create policy fuel_insert_admin on public.fuel_records for insert to authenticated with check ((select public.current_auxilios_role())='administracion');
create policy fuel_insert_driver_own on public.fuel_records for insert to authenticated with check ((select public.current_auxilios_role())='chofer' and log_id is not null and exists(select 1 from public.daily_logs d where d.log_id=fuel_records.log_id and d.driver_id=(select auth.uid()) and d.truck_id=fuel_records.truck_id));
create policy fuel_update_admin on public.fuel_records for update to authenticated using ((select public.current_auxilios_role())='administracion') with check ((select public.current_auxilios_role())='administracion');
create policy fuel_delete_admin on public.fuel_records for delete to authenticated using ((select public.current_auxilios_role())='administracion');

create policy incidents_select_management on public.incidents for select to authenticated using ((select public.current_auxilios_role()) in ('administracion','supervision'));
create policy incidents_select_driver_own on public.incidents for select to authenticated using (driver_id=(select auth.uid()));
create policy incidents_insert_admin on public.incidents for insert to authenticated with check ((select public.current_auxilios_role())='administracion');
create policy incidents_insert_driver_own on public.incidents for insert to authenticated with check ((select public.current_auxilios_role())='chofer' and driver_id=(select auth.uid()) and trip_id is null and (log_id is null or exists(select 1 from public.daily_logs d where d.log_id=incidents.log_id and d.driver_id=(select auth.uid()))));
create policy incidents_update_admin on public.incidents for update to authenticated using ((select public.current_auxilios_role())='administracion') with check ((select public.current_auxilios_role())='administracion');
create policy incidents_delete_admin on public.incidents for delete to authenticated using ((select public.current_auxilios_role())='administracion');

create or replace function public.guard_remito_driver_changes()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
declare
  v_role text:=public.current_auxilios_role();
  v_uid uuid:=auth.uid();
begin
  if auth.role()='service_role' or current_user='postgres' or v_role='administracion' then return new; end if;
  if v_role<>'chofer' or v_uid is null then raise exception 'REMITO_WRITE_NOT_ALLOWED' using errcode='42501'; end if;
  if tg_op='INSERT' then
    if new.driver_id is distinct from v_uid then raise exception 'REMITO_OWNER_INVALID' using errcode='42501'; end if;
    if new.log_id is not null and not exists(select 1 from public.daily_logs d where d.log_id=new.log_id and d.driver_id=v_uid) then raise exception 'REMITO_LOG_INVALID' using errcode='42501'; end if;
    if coalesce(new.status,'pendiente') not in ('pendiente','firmado') then raise exception 'REMITO_STATUS_INVALID' using errcode='42501'; end if;
    new.creado_por:=coalesce(new.creado_por,v_uid);
    return new;
  end if;
  if old.driver_id is distinct from v_uid or new.driver_id is distinct from old.driver_id then raise exception 'REMITO_OWNER_IMMUTABLE' using errcode='42501'; end if;
  if new.nro_remito is distinct from old.nro_remito then raise exception 'REMITO_NUMBER_IMMUTABLE' using errcode='42501'; end if;
  if new.creado_por is distinct from old.creado_por then raise exception 'REMITO_CREATOR_IMMUTABLE' using errcode='42501'; end if;
  if old.log_id is not null and new.log_id is distinct from old.log_id then raise exception 'REMITO_LOG_IMMUTABLE' using errcode='42501'; end if;
  if old.log_id is null and new.log_id is not null and not exists(select 1 from public.daily_logs d where d.log_id=new.log_id and d.driver_id=v_uid) then raise exception 'REMITO_LOG_INVALID' using errcode='42501'; end if;
  if old.status='pendiente' and coalesce(new.status,'pendiente') not in ('pendiente','firmado') then raise exception 'REMITO_STATUS_TRANSITION_INVALID' using errcode='42501'; end if;
  if old.status='firmado' and coalesce(new.status,'firmado')<>'firmado' then raise exception 'REMITO_SIGNED_IMMUTABLE_STATUS' using errcode='42501'; end if;
  if old.status in ('anulado','cerrado_admin') then raise exception 'REMITO_ADMIN_STATUS_LOCKED' using errcode='42501'; end if;
  return new;
end $$;

drop trigger if exists trg_guard_remito_driver_changes on public.remitos;
create trigger trg_guard_remito_driver_changes before insert or update on public.remitos for each row execute function public.guard_remito_driver_changes();

create policy remitos_select_management on public.remitos for select to authenticated using ((select public.current_auxilios_role()) in ('administracion','supervision'));
create policy remitos_select_driver_own on public.remitos for select to authenticated using (driver_id=(select auth.uid()));
create policy remitos_insert_admin on public.remitos for insert to authenticated with check ((select public.current_auxilios_role())='administracion');
create policy remitos_insert_driver_own on public.remitos for insert to authenticated with check ((select public.current_auxilios_role())='chofer' and driver_id=(select auth.uid()) and (log_id is null or exists(select 1 from public.daily_logs d where d.log_id=remitos.log_id and d.driver_id=(select auth.uid()))) and coalesce(status,'pendiente') in ('pendiente','firmado'));
create policy remitos_update_admin on public.remitos for update to authenticated using ((select public.current_auxilios_role())='administracion') with check ((select public.current_auxilios_role())='administracion');
create policy remitos_update_driver_own on public.remitos for update to authenticated using ((select public.current_auxilios_role())='chofer' and driver_id=(select auth.uid())) with check ((select public.current_auxilios_role())='chofer' and driver_id=(select auth.uid()));
create policy remitos_delete_admin on public.remitos for delete to authenticated using ((select public.current_auxilios_role())='administracion');