-- A private per-driver refresh signal. No service, customer or financial payload.
create table public.driver_service_updates(
 driver_id uuid primary key,
 revision bigint not null default 1,
 updated_at timestamptz not null default now()
);
alter table public.driver_service_updates enable row level security;
revoke all on public.driver_service_updates from public,anon,authenticated;
grant select on public.driver_service_updates to authenticated;
create policy driver_reads_own_service_updates on public.driver_service_updates for select to authenticated
 using(driver_id=(select auth.uid()) and(select app_private.current_auxilios_role())='chofer');

create or replace function app_private.signal_driver_service_update_v1()
returns trigger language plpgsql security definer set search_path='' as $f$
declare old_driver uuid; recipient uuid;
begin
 if tg_op='UPDATE' then
  if (new.assigned_driver_id,new.status,new.remito_id,new.document_status,new.driver_queue_position,new.scheduled_for,new.assigned_truck_id,new.origin,new.destination,new.driver_instructions)
   is not distinct from(old.assigned_driver_id,old.status,old.remito_id,old.document_status,old.driver_queue_position,old.scheduled_for,old.assigned_truck_id,old.origin,old.destination,old.driver_instructions) then return new;end if;
  old_driver:=old.assigned_driver_id;
 end if;
 -- Stable lock order for simultaneous reassignments between the same drivers.
 for recipient in select distinct id from unnest(array[old_driver,new.assigned_driver_id]) id where id is not null order by id loop
  insert into public.driver_service_updates as p(driver_id,revision,updated_at) values(recipient,1,now())
  on conflict(driver_id) do update set revision=p.revision+1,updated_at=now();
 end loop;
 return new;
end $f$;
revoke all on function app_private.signal_driver_service_update_v1() from public,anon,authenticated;
create trigger operator_services_signal_driver_v1 after insert or update of assigned_driver_id,status,remito_id,document_status,driver_queue_position,scheduled_for,assigned_truck_id,origin,destination,driver_instructions on public.operator_services
 for each row execute function app_private.signal_driver_service_update_v1();

do $pub$
begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='driver_service_updates') then
  alter publication supabase_realtime add table public.driver_service_updates;
 end if;
end $pub$;
