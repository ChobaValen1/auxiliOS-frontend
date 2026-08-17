-- AuxiliOS · Facturación · tratamiento contractual de peajes v1
-- Separa cómo se obtiene el importe del peaje de cómo se factura a cada prestadora.

alter table public.company_billing_settings
  add column if not exists toll_billing_mode text not null default 'with_service';

alter table public.company_billing_settings
  drop constraint if exists company_billing_settings_toll_billing_mode_check;

alter table public.company_billing_settings
  add constraint company_billing_settings_toll_billing_mode_check
  check (toll_billing_mode in ('with_service','separate'));

comment on column public.company_billing_settings.toll_billing_mode is
  'Tratamiento contractual del peaje: with_service suma el peaje al total del servicio; separate lo excluye del importe del servicio y lo deriva al circuito Facturación > Peajes.';
