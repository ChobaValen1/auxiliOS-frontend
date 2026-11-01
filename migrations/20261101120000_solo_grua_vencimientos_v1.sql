-- AuxiliOS Solo · vencimientos de la grúa (seguro, VTV, habilitación) y km del próximo service.
-- Todo opcional: la app avisa en Inicio 15 días antes y cuando faltan 1.000 km para el service.
alter table public.solo_trucks
  add column if not exists insurance_due date,
  add column if not exists vtv_due date,
  add column if not exists permit_due date,
  add column if not exists next_service_km numeric check (next_service_km is null or next_service_km>=0);
