-- Corregir un servicio finalizado no debe volver su remito a "pendiente de revisión" · 15/10/2026
-- La corrección actualiza datos del remito firmado (teléfono, patente…) y el disparador de visibilidad del remito
-- lo volvía a marcar como 'submitted', sacando el servicio de Facturación. Ahora un remito ya aprobado se mantiene aprobado.
do $$
declare d text:=pg_get_functiondef('app_private.sync_operator_service_driver_remito_visibility_v1'::regproc); n text;
begin
  n:=replace(d,$a$        when new.status = 'firmado' and new.firma_imagen_url is not null then 'submitted'
        when coalesce(s.document_status,'not_started') in ('not_started','draft') then 'draft'$a$,
  $a$        when coalesce(s.document_status,'') in ('approved','exception_approved') then s.document_status
        when new.status = 'firmado' and new.firma_imagen_url is not null then 'submitted'
        when coalesce(s.document_status,'not_started') in ('not_started','draft') then 'draft'$a$);
  n:=replace(n,$a$      administrative_review_status = case
        when new.status = 'firmado' and new.firma_imagen_url is not null then 'pending'$a$,
  $a$      administrative_review_status = case
        when coalesce(s.document_status,'') in ('approved','exception_approved') then s.administrative_review_status
        when new.status = 'firmado' and new.firma_imagen_url is not null then 'pending'$a$);
  if n=d or (length(n)-length(d))<150 then raise exception 'No se pudo parchear sync_operator_service_driver_remito_visibility_v1'; end if;
  execute n;
end $$;
