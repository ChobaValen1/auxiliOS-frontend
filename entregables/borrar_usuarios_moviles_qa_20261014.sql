-- YA APLICADO el 14/10/2026. NO volver a correr.
-- Borra los usuarios de prueba (QA Codex Preview, AuxiliosQA, Chofer de Prueba)
-- y los móviles QA-01 y M301, con sus jornadas, viajes y registros de prueba.
-- Autorizado por el usuario el 14/10/2026. Copia previa en app_private.bkp_20261014_qa_*.
-- Correr UNA sola vez, entero, en el SQL Editor de Supabase.
begin;

create temp table _u on commit drop as select unnest(array[
  '179e6275-85d2-455a-8f35-515915c3b4ca',  -- AuxiliosQA
  '11111111-1111-4111-8111-111111111111',  -- Chofer de Prueba
  '45a7f50a-8ab6-4008-9c32-d690c4a9e9b1'   -- QA Codex Preview Editado
]::uuid[]) id;
create temp table _m on commit drop as select unnest(array[15,13]) id;  -- QA-01, M301
create temp table _l on commit drop as
  select log_id id from public.daily_logs where driver_id in (select id from _u) or truck_id in (select id from _m);

-- Copia de respaldo
create table app_private.bkp_20261014_qa_users as select * from public.users where user_id in (select id from _u);
create table app_private.bkp_20261014_qa_trucks as select * from public.trucks where truck_id in (select id from _m);
create table app_private.bkp_20261014_qa_daily_logs as select * from public.daily_logs where log_id in (select id from _l);
create table app_private.bkp_20261014_qa_trips as select * from public.trips where log_id in (select id from _l) or driver_id in (select id from _u);
revoke all on app_private.bkp_20261014_qa_users, app_private.bkp_20261014_qa_trucks,
  app_private.bkp_20261014_qa_daily_logs, app_private.bkp_20261014_qa_trips from public, anon, authenticated;

-- Registros que cuelgan de las jornadas, viajes y móviles de prueba
delete from public.journey_cash_expenses where log_id in (select id from _l) or updated_by in (select id from _u);
delete from public.alertas_operativas where driver_id in (select id from _u) or log_id in (select id from _l);
delete from public.tire_checks where log_id in (select id from _l) or driver_id in (select id from _u) or truck_id in (select id from _m);
delete from public.fuel_records where log_id in (select id from _l) or truck_id in (select id from _m) or created_by in (select id from _u);
delete from public.trips where log_id in (select id from _l) or driver_id in (select id from _u);
delete from public.daily_logs where log_id in (select id from _l);
delete from public.asignaciones_grilla where driver_id in (select id from _u) or truck_id in (select id from _m);
delete from public.payroll_cash_months where driver_id in (select id from _u);

-- Móviles
delete from public.trucks where truck_id in (select id from _m);

-- Usuarios (borra en cascada su esquema de pago, comisiones, liquidaciones de prueba y presencia)
delete from public.users where user_id in (select id from _u);
delete from auth.users where id in (select id from _u);

-- Control: tiene que dar 0 y 0
select (select count(*) from public.users where user_id in (select id from _u)) usuarios_que_quedan,
       (select count(*) from public.trucks where truck_id in (select id from _m)) moviles_que_quedan;

commit;
