-- AuxiliOS Phase 3B · Entorno QA persistente
-- No crea credenciales de autenticación. La cuenta auth se aprovisiona fuera de la migración.

insert into public.users(
  user_id, role_id, legajo, email, password_hash, full_name,
  phone, dni, is_active, license_number, license_expiry, is_test
)
select
  '11111111-1111-4111-8111-111111111111', role_id, 'QA-CHO-001',
  'chofer.qa@auxilios.test', crypt(gen_random_uuid()::text, gen_salt('bf')),
  'Chofer de Prueba', '1100000000', '99000001', true,
  'QA-LIC-001', current_date + interval '4 years', true
from public.roles
where name = 'chofer'
on conflict (user_id) do update set
  role_id = excluded.role_id,
  legajo = excluded.legajo,
  email = excluded.email,
  full_name = excluded.full_name,
  phone = excluded.phone,
  dni = excluded.dni,
  is_active = true,
  license_number = excluded.license_number,
  license_expiry = excluded.license_expiry,
  is_test = true;

insert into public.trucks(
  plate, brand, model, year, current_km, status, assigned_to,
  notes, numero_interno, tipo_equipo, is_test
)
values (
  'QA001AA', 'AuxiliOS', 'Móvil de Prueba', 2026, 1000, 'active',
  '11111111-1111-4111-8111-111111111111',
  'ENTORNO QA · No utilizar en operación real', 'QA-01', 'Plancha', true
)
on conflict (plate) do update set
  brand = excluded.brand,
  model = excluded.model,
  year = excluded.year,
  status = 'active',
  assigned_to = excluded.assigned_to,
  notes = excluded.notes,
  numero_interno = excluded.numero_interno,
  tipo_equipo = excluded.tipo_equipo,
  is_test = true;

insert into public.companies(
  company_id, company_code, legal_name, trade_name, status,
  phone, operational_email, notes, created_by, updated_by, is_test
)
values (
  '22222222-2222-4222-8222-222222222222', 'QA-00001',
  'AuxiliOS Prestadora QA', 'Prestadora QA', 'active', '1100000000',
  'qa@auxilios.test',
  'ENTORNO QA · Servicios excluidos de la operación y facturación real',
  '467001a3-87b9-4b54-b0a1-c317fed59e48',
  '467001a3-87b9-4b54-b0a1-c317fed59e48', true
)
on conflict (company_id) do update set
  legal_name = excluded.legal_name,
  trade_name = excluded.trade_name,
  status = 'active',
  notes = excluded.notes,
  updated_by = excluded.updated_by,
  updated_at = now(),
  is_test = true;

insert into public.company_contracts(
  contract_id, company_id, contract_number, name, status, valid_from,
  currency, billing_frequency, payment_terms_days,
  requires_service_order, requires_purchase_order, is_primary,
  notes, created_by, updated_by
)
values (
  '33333333-3333-4333-8333-333333333333',
  '22222222-2222-4222-8222-222222222222',
  'QA-CONTRATO-001', 'Convenio operativo QA', 'active', current_date - 1,
  'ARS', 'per_service', 0, true, false, true,
  'Tarifario ficticio exclusivamente para validación funcional',
  '467001a3-87b9-4b54-b0a1-c317fed59e48',
  '467001a3-87b9-4b54-b0a1-c317fed59e48'
)
on conflict (contract_id) do update set
  status = 'active',
  valid_from = current_date - 1,
  valid_until = null,
  requires_service_order = true,
  requires_purchase_order = false,
  is_primary = true,
  updated_by = excluded.updated_by,
  updated_at = now();

insert into public.billing_bases(
  base_id, base_code, name, address, city, province, country,
  latitude, longitude, address_source, address_verified, is_active,
  notes, created_by, updated_by
)
values (
  '55555555-5555-4555-8555-555555555555', 'QA-BASE-01',
  'Base QA Pinamar', 'Av. Bunge 100, Pinamar', 'Pinamar',
  'Buenos Aires', 'Argentina', -37.1070, -56.8610,
  'manual', false, true, 'Base ficticia para pruebas funcionales',
  '467001a3-87b9-4b54-b0a1-c317fed59e48',
  '467001a3-87b9-4b54-b0a1-c317fed59e48'
)
on conflict (base_id) do update set
  name = excluded.name,
  address = excluded.address,
  city = excluded.city,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  is_active = true,
  notes = excluded.notes,
  updated_by = excluded.updated_by,
  updated_at = now();

insert into public.company_branches(
  branch_id, company_id, branch_code, name, address, city, province,
  latitude, longitude, is_primary, is_active, notes,
  created_by, updated_by, purpose, contract_id, valid_from,
  route_mode, toll_calculation_mode, address_source, address_verified
)
values (
  '55555555-5555-4555-8555-555555555555',
  '22222222-2222-4222-8222-222222222222', 'QA-BASE-01',
  'Base QA Pinamar', 'Av. Bunge 100, Pinamar', 'Pinamar', 'Buenos Aires',
  -37.1070, -56.8610, false, true,
  'Compatibilidad operativa con base de facturación QA',
  '467001a3-87b9-4b54-b0a1-c317fed59e48',
  '467001a3-87b9-4b54-b0a1-c317fed59e48',
  'billing', '33333333-3333-4333-8333-333333333333', current_date - 1,
  'origin_destination', 'manual', 'manual', false
)
on conflict (branch_id) do update set
  company_id = excluded.company_id,
  name = excluded.name,
  address = excluded.address,
  city = excluded.city,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  is_active = true,
  contract_id = excluded.contract_id,
  valid_from = current_date - 1,
  valid_until = null,
  updated_by = excluded.updated_by,
  updated_at = now();

insert into public.company_billing_settings(
  billing_setting_id, company_id, contract_id, route_mode,
  toll_calculation_mode, valid_from, requires_verified_base,
  is_active, notes, created_by, updated_by
)
values (
  '66666666-6666-4666-8666-666666666666',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  'origin_destination', 'manual', current_date - 1, false, true,
  'Configuración de facturación QA',
  '467001a3-87b9-4b54-b0a1-c317fed59e48',
  '467001a3-87b9-4b54-b0a1-c317fed59e48'
)
on conflict (billing_setting_id) do update set
  is_active = true,
  valid_from = current_date - 1,
  valid_until = null,
  requires_verified_base = false,
  updated_by = excluded.updated_by,
  updated_at = now();

insert into public.company_billing_base_links(
  billing_setting_id, base_id, is_primary, priority, is_active,
  notes, created_by, updated_by
)
values (
  '66666666-6666-4666-8666-666666666666',
  '55555555-5555-4555-8555-555555555555', false, 100, true,
  'Base habilitada para QA',
  '467001a3-87b9-4b54-b0a1-c317fed59e48',
  '467001a3-87b9-4b54-b0a1-c317fed59e48'
)
on conflict (billing_setting_id, base_id) do update set
  is_active = true,
  notes = excluded.notes,
  updated_by = excluded.updated_by,
  updated_at = now();

insert into public.company_rate_cards(
  rate_card_id, contract_id, name, version, status, valid_from,
  currency, notes, created_by, updated_by
)
values (
  '44444444-4444-4444-8444-444444444444',
  '33333333-3333-4333-8333-333333333333',
  'Tarifario QA', 1, 'draft', current_date - 1, 'ARS',
  'Valores ficticios sin impacto contable',
  '467001a3-87b9-4b54-b0a1-c317fed59e48',
  '467001a3-87b9-4b54-b0a1-c317fed59e48'
)
on conflict (rate_card_id) do update set
  status = 'draft',
  valid_from = current_date - 1,
  valid_until = null,
  updated_by = excluded.updated_by,
  updated_at = now();
