-- Índices de soporte para las claves foráneas de la recepción estructurada.
-- La migración principal ya crea estos índices en instalaciones nuevas; este
-- delta los incorpora en producción, donde remito_addons_review_v2 ya existe.

create index if not exists operator_service_document_addon_review_excess_charge_idx
  on public.operator_service_document_addon_reviews(excess_charge_id)
  where excess_charge_id is not null;

create index if not exists operator_service_document_addon_review_remito_idx
  on public.operator_service_document_addon_reviews(remito_id);

create index if not exists operator_service_document_addon_review_reviewer_idx
  on public.operator_service_document_addon_reviews(reviewed_by);

create index if not exists operator_service_document_addon_review_service_toll_idx
  on public.operator_service_document_addon_reviews(service_toll_id)
  where service_toll_id is not null;

create index if not exists remito_evidence_created_by_idx
  on public.remito_evidence(created_by);

create index if not exists remito_excess_reports_created_by_idx
  on public.remito_excess_reports(created_by);

create index if not exists remito_toll_reports_created_by_idx
  on public.remito_toll_reports(created_by);
