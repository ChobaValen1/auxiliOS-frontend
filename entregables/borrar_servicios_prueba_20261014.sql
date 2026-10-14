-- Borrar los 4 servicios de prueba · 14/10/2026
-- SERVICIO PRUEBA, SERVICIO PRUEBA 2, Servicio de Prueba 01 y Servicio de Prueba 2.
-- Son todos del Chofer de Prueba: se borran también su remito de prueba (4294)
-- y sus 2 viajes (724 y 725). La jornada del Chofer de Prueba no se toca.
-- Correr UNA sola vez, entero, en el SQL Editor de Supabase.
-- Si algo falla no se borra nada.
begin;
select set_config('app.phase3_bridge','1',true);

create temp table _srv_prueba(id uuid) on commit drop;
insert into _srv_prueba values
  ('08432508-f8f2-460f-8036-69245f92822f'),('872ec165-bf21-4b31-9e03-46569a4aba7f'),
  ('e88b7686-4252-49fb-a974-6fa99e9a0992'),('3ca7ebb7-bfc1-44f4-92b7-b0beff52b8e7');

-- Seguro: solo servicios marcados como prueba
do $$ begin
  if (select count(*) from public.operator_services where service_id in (select id from _srv_prueba) and is_test) <> 4 then
    raise exception 'No son los 4 servicios de prueba: no se borra nada';
  end if;
end $$;

update public.operator_services set remito_id=null, trip_id=null where service_id in (select id from _srv_prueba);
delete from public.operator_service_billing_revisions where service_id in (select id from _srv_prueba);
-- Peajes, excedentes y revisiones que apuntan al remito de prueba
delete from public.operator_service_document_addon_reviews where service_id in (select id from _srv_prueba)
  or toll_report_id in (select toll_report_id from public.remito_toll_reports where remito_id=4294)
  or excess_report_id in (select excess_report_id from public.remito_excess_reports where remito_id=4294);
delete from public.operator_service_tolls where service_id in (select id from _srv_prueba)
  or remito_toll_report_id in (select toll_report_id from public.remito_toll_reports where remito_id=4294);
delete from public.operator_service_excess_charges where service_id in (select id from _srv_prueba)
  or remito_excess_report_id in (select excess_report_id from public.remito_excess_reports where remito_id=4294);
delete from public.remitos where remito_id=4294 and driver_id='dd48a407-2923-4be4-a202-85ed9f67a735';
delete from public.operator_services where service_id in (select id from _srv_prueba);
delete from public.incidents where trip_id in (724,725);
delete from public.trips where trip_id in (724,725) and driver_id='dd48a407-2923-4be4-a202-85ed9f67a735';

-- Control: tiene que dar 0 y 0
select (select count(*) from public.operator_services where service_id in (select id from _srv_prueba)) servicios,
       (select count(*) from public.trips where trip_id in (724,725)) viajes;
commit;
