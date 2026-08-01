create index if not exists operator_services_branch_idx on public.operator_services(branch_id) where branch_id is not null;
create index if not exists operator_services_contract_idx on public.operator_services(contract_id);
create index if not exists operator_services_rate_card_idx on public.operator_services(rate_card_id);
create index if not exists operator_services_primary_concept_idx on public.operator_services(primary_concept_id);
create index if not exists operator_services_assigned_by_idx on public.operator_services(assigned_by) where assigned_by is not null;
create index if not exists operator_services_created_by_idx on public.operator_services(created_by);
create index if not exists operator_services_updated_by_idx on public.operator_services(updated_by);
create index if not exists operator_services_trip_idx on public.operator_services(trip_id) where trip_id is not null;
create index if not exists operator_services_remito_idx on public.operator_services(remito_id) where remito_id is not null;
create index if not exists operator_service_items_concept_idx on public.operator_service_items(concept_id);
create index if not exists operator_service_items_rate_item_idx on public.operator_service_items(rate_item_id) where rate_item_id is not null;
create index if not exists operator_service_events_created_by_idx on public.operator_service_events(created_by) where created_by is not null;

drop policy if exists operator_services_select_access on public.operator_services;
create policy operator_services_select_access on public.operator_services
for select to authenticated
using (
  (select app_private.current_auxilios_role()) in ('administracion','supervision')
  or assigned_driver_id = (select auth.uid())
);

drop policy if exists operator_services_insert_management on public.operator_services;
create policy operator_services_insert_management on public.operator_services
for insert to authenticated
with check (
  (select app_private.current_auxilios_role()) in ('administracion','supervision')
  and created_by = (select auth.uid())
);

drop policy if exists operator_services_update_management on public.operator_services;
drop policy if exists operator_services_update_driver_assigned on public.operator_services;
create policy operator_services_update_access on public.operator_services
for update to authenticated
using (
  (select app_private.current_auxilios_role()) in ('administracion','supervision')
  or (
    (select app_private.current_auxilios_role()) = 'chofer'
    and assigned_driver_id = (select auth.uid())
  )
)
with check (
  (select app_private.current_auxilios_role()) in ('administracion','supervision')
  or (
    (select app_private.current_auxilios_role()) = 'chofer'
    and assigned_driver_id = (select auth.uid())
  )
);

drop policy if exists operator_services_delete_admin on public.operator_services;
create policy operator_services_delete_admin on public.operator_services
for delete to authenticated
using (
  (select app_private.current_auxilios_role()) = 'administracion'
  and status in ('pending','cancelled')
);

drop policy if exists operator_service_items_select_access on public.operator_service_items;
drop policy if exists operator_service_items_write_management on public.operator_service_items;
create policy operator_service_items_select_access on public.operator_service_items
for select to authenticated
using (
  (select app_private.current_auxilios_role()) in ('administracion','supervision')
  or exists (
    select 1 from public.operator_services s
    where s.service_id = operator_service_items.service_id
      and s.assigned_driver_id = (select auth.uid())
  )
);
create policy operator_service_items_insert_management on public.operator_service_items
for insert to authenticated
with check ((select app_private.current_auxilios_role()) in ('administracion','supervision'));
create policy operator_service_items_update_management on public.operator_service_items
for update to authenticated
using ((select app_private.current_auxilios_role()) in ('administracion','supervision'))
with check ((select app_private.current_auxilios_role()) in ('administracion','supervision'));
create policy operator_service_items_delete_management on public.operator_service_items
for delete to authenticated
using ((select app_private.current_auxilios_role()) in ('administracion','supervision'));

drop policy if exists operator_service_events_select_access on public.operator_service_events;
create policy operator_service_events_select_access on public.operator_service_events
for select to authenticated
using (
  (select app_private.current_auxilios_role()) in ('administracion','supervision')
  or exists (
    select 1 from public.operator_services s
    where s.service_id = operator_service_events.service_id
      and s.assigned_driver_id = (select auth.uid())
  )
);
