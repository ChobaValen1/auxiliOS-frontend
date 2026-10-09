-- Empresa y documentos: opción para imprimir la firma institucional en los PDF de remitos.
-- Aditivo: por defecto apagado, así los PDF siguen saliendo igual hasta que Administración lo active.
alter table public.company_document_settings
  add column if not exists signature_in_pdf boolean not null default false;
