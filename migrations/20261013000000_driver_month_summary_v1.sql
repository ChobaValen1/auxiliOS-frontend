-- Resumen del mes del chofer (Panel del chofer).
-- El Panel calculaba lo cobrado con remitos.pago_1_metodo, que los remitos nuevos
-- (addons v2, desde septiembre) ya no completan: el cobro vive en los peajes, los
-- excedentes y los cobros de particulares. Esta función arma todo el mes en una
-- sola consulta, con la misma cuenta de efectivo que Sueldos
-- (app_private.monthly_cash_source), así los números coinciden.
-- Sólo lectura. El chofer ve lo suyo; Administración y Supervisión, cualquier chofer.

create or replace function app_private.driver_month_ops_v1(p_driver uuid, p_from date)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  with logs as (
    select j.log_id, j.log_date, j.truck_id, j.status,
           case when j.status = 'closed' and j.km_final is not null and j.km_inicio is not null then greatest(0, j.km_final - j.km_inicio) else 0 end as km,
           case when j.horas_final is not null and j.horas_inicio is not null then greatest(0, j.horas_final - j.horas_inicio) else 0 end as horas
      from public.daily_logs j
     where j.driver_id = p_driver and j.status in ('open','closed')
       and j.log_date >= p_from and j.log_date < (p_from + interval '1 month')::date
  ), rem as (
    select r.remito_id, r.log_id, r.addons_version, r.pago_1_metodo, r.pago_1_monto, r.pago_2_metodo, r.pago_2_monto,
           (r.addons_version >= 2
             or exists (select 1 from public.remito_toll_reports t where t.remito_id = r.remito_id)
             or exists (select 1 from public.remito_excess_reports e where e.remito_id = r.remito_id)) as v2
      from public.remitos r join logs l on l.log_id = r.log_id
     where r.status <> 'anulado'
  ), lines as (
    -- remitos viejos: pago 1 y 2
    select case when pago_1_metodo in ('efectivo','cash') then 'cash' when pago_1_metodo in ('transferencia','transfer') then 'transfer' when pago_1_metodo in ('tarjeta','card') then 'card' else 'other' end m, coalesce(pago_1_monto,0) a
      from rem where not v2 and coalesce(pago_1_monto,0) > 0
    union all
    select case when pago_2_metodo in ('efectivo','cash') then 'cash' when pago_2_metodo in ('transferencia','transfer') then 'transfer' when pago_2_metodo in ('tarjeta','card') then 'card' else 'other' end, coalesce(pago_2_monto,0)
      from rem where not v2 and coalesce(pago_2_monto,0) > 0
    union all
    -- remitos nuevos: lo que pagó el cliente en peajes y excedentes
    select coalesce(nullif(t.customer_payment_method,''),'other'), t.total_amount
      from public.remito_toll_reports t join rem on rem.remito_id = t.remito_id
     where rem.v2 and t.customer_payment_method is not null
    union all
    select coalesce(nullif(e.customer_payment_method,''),'other'), e.total_amount
      from public.remito_excess_reports e join rem on rem.remito_id = e.remito_id
     where rem.v2 and e.customer_payment_method is not null
    union all
    -- particulares
    select coalesce(l->>'method','other'), (l->>'amount')::numeric
      from public.service_collection_reports c join rem on rem.remito_id = c.remito_id
      cross join lateral jsonb_array_elements(c.lines) l
     where c.status <> 'rejected'
  ), fuel as (
    select f.liters, f.total_cost
      from public.fuel_records f
      join logs l on l.log_id = app_private.resolve_fuel_journey(f.log_id, f.truck_id, f.fuel_date)
     where coalesce(f.status,'') <> 'voided' and f.voided_at is null
  ), days as (
    select l.log_date, sum(l.km) km, sum((select count(*) from rem where rem.log_id = l.log_id)) servicios
      from logs l group by l.log_date
  )
  select jsonb_build_object(
    'servicios', (select count(*) from rem),
    'jornadas', (select count(*) from logs),
    'jornadas_cerradas', (select count(*) from logs where status = 'closed'),
    'km', (select coalesce(sum(km),0) from logs),
    'horas_motor', (select round(coalesce(sum(horas),0)::numeric, 1) from logs),
    'cobros', jsonb_build_object(
      'cash', (select coalesce(sum(a),0) from lines where m = 'cash'),
      'transfer', (select coalesce(sum(a),0) from lines where m = 'transfer'),
      'card', (select coalesce(sum(a),0) from lines where m = 'card'),
      'other', (select coalesce(sum(a),0) from lines where m not in ('cash','transfer','card')),
      'total', (select coalesce(sum(a),0) from lines)),
    'combustible', jsonb_build_object(
      'litros', (select coalesce(sum(liters),0) from fuel),
      'costo', (select coalesce(sum(total_cost),0) from fuel)),
    'por_dia', coalesce((select jsonb_agg(jsonb_build_object('fecha', log_date, 'km', km, 'servicios', servicios) order by log_date) from days), '[]'::jsonb)
  );
$function$;

revoke all on function app_private.driver_month_ops_v1(uuid, date) from public, anon, authenticated;

create or replace function public.get_driver_month_summary_v1(p_period integer, p_driver uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_driver uuid := coalesce(p_driver, auth.uid());
  v_role text := coalesce(app_private.current_auxilios_role(), '');
  v_from date; v_prev date; v_cash jsonb; v_rendido numeric;
begin
  if auth.uid() is null or v_role = '' then raise exception 'Sin permiso'; end if;
  if v_driver <> auth.uid() and v_role not in ('administracion','supervision') then raise exception 'Sin permiso'; end if;
  if p_period is null or p_period/100 not between 2000 and 2199 or p_period%100 not between 1 and 12 then raise exception 'Período inválido'; end if;
  v_from := make_date(p_period/100, p_period%100, 1);
  v_prev := (v_from - interval '1 month')::date;
  v_cash := app_private.monthly_cash_source(v_driver, p_period);
  select coalesce(sum(c.efectivo_declarado),0) into v_rendido
    from public.rendicion_cierre c join public.daily_logs j on j.log_id = c.log_id
   where j.driver_id = v_driver and c.estado <> 'rechazado'
     and j.log_date >= v_from and j.log_date < (v_from + interval '1 month')::date;
  return jsonb_build_object(
    'period', p_period,
    'driver_id', v_driver,
    'mes', app_private.driver_month_ops_v1(v_driver, v_from),
    'anterior', app_private.driver_month_ops_v1(v_driver, v_prev) - 'por_dia',
    'efectivo', jsonb_build_object(
      'cobrado', coalesce((v_cash->>'expected')::numeric, 0),
      'gastos', coalesce((v_cash->>'expenses')::numeric, 0),
      'a_rendir', coalesce((v_cash->>'due')::numeric, 0),
      'rendido', v_rendido,
      'pendiente', greatest(0, coalesce((v_cash->>'due')::numeric, 0) - v_rendido)),
    'generado_at', now());
end $function$;

revoke all on function public.get_driver_month_summary_v1(integer, uuid) from public, anon;
grant execute on function public.get_driver_month_summary_v1(integer, uuid) to authenticated;
