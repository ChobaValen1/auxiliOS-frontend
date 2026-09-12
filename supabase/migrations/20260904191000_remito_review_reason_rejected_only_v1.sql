alter table public.operator_service_document_addon_reviews
  drop constraint if exists operator_service_document_addon_review_reason_chk;

alter table public.operator_service_document_addon_reviews
  add constraint operator_service_document_addon_review_reason_chk
  check (
    decision <> 'rejected'
    or nullif(btrim(reason),'') is not null
  );
