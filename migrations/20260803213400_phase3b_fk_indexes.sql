-- AuxiliOS Phase 3B · Índices de claves foráneas
create index if not exists operator_service_assignments_truck_idx
  on public.operator_service_assignments(truck_id);

create index if not exists operator_service_assignments_assigned_by_idx
  on public.operator_service_assignments(assigned_by)
  where assigned_by is not null;

create index if not exists operator_service_assignments_released_by_idx
  on public.operator_service_assignments(released_by)
  where released_by is not null;

create index if not exists operator_service_closures_assignment_idx
  on public.operator_service_closures(assignment_id)
  where assignment_id is not null;

create index if not exists operator_service_closures_reviewed_by_idx
  on public.operator_service_closures(billing_reviewed_by)
  where billing_reviewed_by is not null;

create index if not exists operator_service_closures_closed_by_idx
  on public.operator_service_closures(closed_by)
  where closed_by is not null;
