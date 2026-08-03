-- AuxiliOS Phase 3B · Tarifario QA ficticio

insert into public.company_rate_items(
  rate_item_id, rate_card_id, branch_id, billing_base_id,
  service_code, service_name, base_price, included_km, extra_km_price,
  km_calculation_method, tolls_mode, cancellation_fee, minimum_charge,
  is_active, notes, concept_id, can_be_primary, can_be_secondary,
  pricing_unit, primary_price, secondary_price, code_mode,
  created_by, updated_by
)
values
(
  '77777777-7777-4777-8777-777777777777',
  '44444444-4444-4444-8444-444444444444', null,
  '55555555-5555-4555-8555-555555555555',
  'qa_liviano', 'Liviano QA', 10000, 10, 1000,
  'one_way', 'at_cost', 2500, 10000, true,
  'Servicio principal ficticio',
  'eb2a36c7-8a36-40df-809c-069c63cb97d4',
  true, false, 'service', 10000, 0, 'generated',
  '467001a3-87b9-4b54-b0a1-c317fed59e48',
  '467001a3-87b9-4b54-b0a1-c317fed59e48'
),
(
  '88888888-8888-4888-8888-888888888888',
  '44444444-4444-4444-8444-444444444444', null,
  '55555555-5555-4555-8555-555555555555',
  'qa_extraction', 'Extracción QA', 0, 0, 0,
  'manual', 'not_applicable', 0, 0, true,
  'Adicional ficticio',
  '5b150179-e3c5-4e4c-b163-e55ba8e8c3b1',
  false, true, 'service', 0, 3000, 'generated',
  '467001a3-87b9-4b54-b0a1-c317fed59e48',
  '467001a3-87b9-4b54-b0a1-c317fed59e48'
),
(
  '99999999-9999-4999-8999-999999999999',
  '44444444-4444-4444-8444-444444444444', null,
  '55555555-5555-4555-8555-555555555555',
  'qa_cancellation', 'Cancelación QA', 0, 0, 0,
  'manual', 'not_applicable', 2500, 0, true,
  'Adicional ficticio',
  'ef5c849a-3b29-4733-a08c-dd9381cc3c99',
  false, true, 'service', 0, 2500, 'generated',
  '467001a3-87b9-4b54-b0a1-c317fed59e48',
  '467001a3-87b9-4b54-b0a1-c317fed59e48'
)
on conflict (rate_item_id) do update set
  is_active = true,
  primary_price = excluded.primary_price,
  secondary_price = excluded.secondary_price,
  included_km = excluded.included_km,
  extra_km_price = excluded.extra_km_price,
  cancellation_fee = excluded.cancellation_fee,
  billing_base_id = excluded.billing_base_id,
  branch_id = null,
  updated_by = excluded.updated_by,
  updated_at = now();

insert into public.company_rate_service_links(
  link_id, rate_card_id, primary_concept_id, secondary_concept_id,
  is_enabled, notes, created_by, updated_by
)
values
(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  '44444444-4444-4444-8444-444444444444',
  'eb2a36c7-8a36-40df-809c-069c63cb97d4',
  '5b150179-e3c5-4e4c-b163-e55ba8e8c3b1',
  true, 'Compatibilidad QA',
  '467001a3-87b9-4b54-b0a1-c317fed59e48',
  '467001a3-87b9-4b54-b0a1-c317fed59e48'
),
(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
  '44444444-4444-4444-8444-444444444444',
  'eb2a36c7-8a36-40df-809c-069c63cb97d4',
  'ef5c849a-3b29-4733-a08c-dd9381cc3c99',
  true, 'Compatibilidad QA',
  '467001a3-87b9-4b54-b0a1-c317fed59e48',
  '467001a3-87b9-4b54-b0a1-c317fed59e48'
)
on conflict (link_id) do update set
  is_enabled = true,
  updated_by = excluded.updated_by,
  updated_at = now();

insert into public.company_rate_billing_settings(
  rate_card_id, copay_enabled, toll_enabled, toll_invoice_enabled,
  toll_mode, require_toll_receipt, created_by, updated_by
)
values (
  '44444444-4444-4444-8444-444444444444', false, true, true,
  'at_cost', false,
  '467001a3-87b9-4b54-b0a1-c317fed59e48',
  '467001a3-87b9-4b54-b0a1-c317fed59e48'
)
on conflict (rate_card_id) do update set
  toll_enabled = true,
  toll_invoice_enabled = true,
  toll_mode = 'at_cost',
  require_toll_receipt = false,
  updated_by = excluded.updated_by,
  updated_at = now();

update public.company_rate_cards
set status = 'active',
    valid_from = current_date - 1,
    valid_until = null,
    updated_by = '467001a3-87b9-4b54-b0a1-c317fed59e48',
    updated_at = now()
where rate_card_id = '44444444-4444-4444-8444-444444444444';
