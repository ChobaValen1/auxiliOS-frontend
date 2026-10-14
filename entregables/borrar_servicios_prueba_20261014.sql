-- YA APLICADO el 14/10/2026. Queda como registro: NO volver a correr.
-- Borra los 55 servicios de prueba, sus 5 facturas, cobros, revisiones, los 38 remitos unidos y sus precargas.
-- Antes guarda una copia en app_private.bkp_20261014_*. Si algún conteo no coincide, no se aplica nada.
-- Cómo usarlo: Supabase > SQL Editor > New query > pegar todo > Run.
begin;
create temp table _s on commit drop as select service_id from public.operator_services;
create temp table _r on commit drop as
  select remito_id from public.remitos where operator_service_id in (select service_id from _s)
  union select remito_id from public.operator_services where remito_id is not null;
create temp table _i on commit drop as
  select distinct invoice_id from public.operator_invoice_services where service_id in (select service_id from _s)
  union select distinct it.invoice_id from public.operator_invoice_tolls it join public.operator_service_tolls t on t.service_toll_id=it.service_toll_id where t.service_id in (select service_id from _s);
create temp table _k on commit drop as
  select intake_id from public.driver_service_intakes
  where linked_service_id in (select service_id from _s) or remito_id in (select remito_id from _r)
     or intake_id in (select driver_intake_id from public.remitos where remito_id in (select remito_id from _r) and driver_intake_id is not null);
-- precargas que también usa un remito que se conserva: se desvinculan en vez de borrarse
create temp table _k_keep on commit drop as
  select distinct driver_intake_id intake_id from public.remitos where driver_intake_id in (select intake_id from _k) and remito_id not in (select remito_id from _r);

-- Copia de respaldo
create table app_private.bkp_20261014_operator_services as select * from public.operator_services where service_id in (select service_id from _s);
create table app_private.bkp_20261014_operator_service_items as select * from public.operator_service_items where service_id in (select service_id from _s);
create table app_private.bkp_20261014_operator_service_tolls as select * from public.operator_service_tolls where service_id in (select service_id from _s);
create table app_private.bkp_20261014_operator_service_excess_charges as select * from public.operator_service_excess_charges where service_id in (select service_id from _s);
create table app_private.bkp_20261014_operator_service_billing_revisions as select * from public.operator_service_billing_revisions where service_id in (select service_id from _s);
create table app_private.bkp_20261014_service_payments as select * from public.service_payments where service_id in (select service_id from _s);
create table app_private.bkp_20261014_operator_invoices as select * from public.operator_invoices where invoice_id in (select invoice_id from _i);
create table app_private.bkp_20261014_operator_invoice_services as select * from public.operator_invoice_services where invoice_id in (select invoice_id from _i);
create table app_private.bkp_20261014_operator_invoice_tolls as select * from public.operator_invoice_tolls where invoice_id in (select invoice_id from _i);
create table app_private.bkp_20261014_remitos as select * from public.remitos where remito_id in (select remito_id from _r);
create table app_private.bkp_20261014_driver_service_intakes as select * from public.driver_service_intakes where intake_id in (select intake_id from _k);
revoke all on app_private.bkp_20261014_operator_services, app_private.bkp_20261014_operator_service_items, app_private.bkp_20261014_operator_service_tolls,
  app_private.bkp_20261014_operator_service_excess_charges, app_private.bkp_20261014_operator_service_billing_revisions, app_private.bkp_20261014_service_payments,
  app_private.bkp_20261014_operator_invoices, app_private.bkp_20261014_operator_invoice_services, app_private.bkp_20261014_operator_invoice_tolls,
  app_private.bkp_20261014_remitos, app_private.bkp_20261014_driver_service_intakes from public, anon, authenticated;

-- Facturas
delete from public.operator_invoice_credit_notes where invoice_id in (select invoice_id from _i);
delete from public.operator_invoice_tolls where invoice_id in (select invoice_id from _i);
delete from public.operator_invoice_services where invoice_id in (select invoice_id from _i);
delete from public.operator_invoices where invoice_id in (select invoice_id from _i);

-- Dependencias que no se borran solas
delete from public.operator_service_document_addon_reviews where service_id in (select service_id from _s) or remito_id in (select remito_id from _r);
delete from public.operator_service_item_adjustments where service_id in (select service_id from _s);
delete from public.operator_service_billing_revisions where service_id in (select service_id from _s);
update public.driver_service_intakes set linked_service_id=null, remito_id=null where intake_id in (select intake_id from _k_keep);
-- Peajes y excedentes del servicio apuntan a los del remito: van primero.
delete from public.operator_service_excess_charges where service_id in (select service_id from _s);
delete from public.operator_service_tolls where service_id in (select service_id from _s);
-- Servicios, remitos y precargas se apuntan entre sí: se borran juntos en una sola instrucción
-- (sin modificar remitos firmados). Borra en cascada ítems, eventos, cobros, evidencias, etc.
with d_intakes as (
  delete from public.driver_service_intakes
  where intake_id in (select intake_id from _k) and intake_id not in (select intake_id from _k_keep)
  returning 1
), d_remitos as (
  delete from public.remitos where remito_id in (select remito_id from _r) returning 1
)
delete from public.operator_services where service_id in (select service_id from _s);

do $t$ declare v_srv int; v_rem int; v_bkp_srv int; v_bkp_rem int; begin
  select count(*) into v_srv from public.operator_services;
  select count(*) into v_rem from public.remitos;
  select count(*) into v_bkp_srv from app_private.bkp_20261014_operator_services;
  select count(*) into v_bkp_rem from app_private.bkp_20261014_remitos;
  if v_srv<>0 or v_bkp_srv<>55 or v_bkp_rem<>38 or v_rem<>1600 then
    raise exception 'CHEQUEO_FALLIDO servicios=% remitos=% bkp_srv=% bkp_rem=%', v_srv, v_rem, v_bkp_srv, v_bkp_rem;
  end if;
end $t$;
commit;
