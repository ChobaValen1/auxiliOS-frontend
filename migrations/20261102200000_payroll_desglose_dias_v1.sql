-- Sueldos Flota · desglose por día para el recibo PDF y el Excel del mes.
-- Mismas fuentes que el sueldo: km de jornadas cerradas, servicios con el conteo del sueldo (v2),
-- efectivo esperado de la rendición mensual guardada en el recibo, y ventas/comisiones del recibo.
-- Solo lectura; Administración y Supervisión.

create or replace function app_private.payroll_desglose_core_v1(p_liq uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $f$
declare l public.payroll_liquidaciones%rowtype; v_from date; v_until date; v_ts_from timestamptz; v_ts_until timestamptz; v_cash jsonb; v_dias jsonb; v_ventas jsonb;
begin
  select * into l from public.payroll_liquidaciones where liquidacion_id=p_liq;
  if not found then return null; end if;
  v_from:=make_date(l.periodo_yyyymm/100,l.periodo_yyyymm%100,1); v_until:=(v_from+interval '1 month')::date;
  v_ts_from:=v_from::timestamp at time zone 'America/Argentina/Buenos_Aires'; v_ts_until:=v_until::timestamp at time zone 'America/Argentina/Buenos_Aires';
  v_cash:=coalesce(l.cash_snapshot,app_private.monthly_cash_source_v2(l.driver_id,l.periodo_yyyymm));
  with ve as (
    select d->>'name' regla, d->>'mode' modo, (d->>'value')::numeric valor, r->>'service_id' sid,
           nullif(r->>'amount','')::numeric monto, nullif(r->>'quantity','')::numeric cantidad, coalesce((r->>'total')::numeric,0) comision
    from jsonb_array_elements(coalesce(l.compensation_snapshot->'commission_details','[]'::jsonb)) d,
         jsonb_array_elements(coalesce(d->'record_details','[]'::jsonb)) r
  )
  select coalesce(jsonb_agg(jsonb_build_object('fecha',x.dia,'servicio',x.service_number,'regla',x.regla,'modo',x.modo,'valor',x.valor,'venta',x.monto,'cantidad',x.cantidad,'comision',x.comision) order by x.dia nulls last,x.service_number,x.regla),'[]')
    into v_ventas
  from (select ve.*, os.service_number, (os.completed_at at time zone 'America/Argentina/Buenos_Aires')::date dia from ve left join public.operator_services os on os.service_id::text=ve.sid) x;
  with j as (
    select d.log_date dia,
           sum(case when d.status='closed' and d.km_inicio is not null and d.km_final is not null and d.km_final>=d.km_inicio then d.km_final-d.km_inicio else 0 end) km,
           string_agg(distinct t.plate,' / ') moviles, bool_or(d.status<>'closed') abierta, count(*) jornadas
    from public.daily_logs d left join public.trucks t on t.truck_id=d.truck_id
    where d.driver_id=l.driver_id and d.log_date>=v_from and d.log_date<v_until group by 1
  ), sv as (
    select dia, count(distinct k) n from (
      select (c.completed_at at time zone 'America/Argentina/Buenos_Aires')::date dia, 's:'||c.service_id k from app_private.completed_driver_services_v2() c
       where c.driver_id=l.driver_id and c.completed_at>=v_ts_from and c.completed_at<v_ts_until
      union
      select (r.created_at_device at time zone 'America/Argentina/Buenos_Aires')::date, coalesce('s:'||r.operator_service_id,'r:'||r.remito_id) from public.remitos r
        left join public.operator_services s on s.service_id=r.operator_service_id
       where r.driver_id=l.driver_id and r.status='firmado'
         and (s.service_id is null or (s.status not in ('completed','cancelled') and s.logistics_type='own'))
         and not exists(select 1 from public.operator_services x where x.remito_id=r.remito_id and x.status in ('completed','cancelled'))
         and r.created_at_device>=v_ts_from and r.created_at_device<v_ts_until
    ) e group by 1
  ), cash as (
    select (x->>'fecha')::date dia, coalesce((x->>'expected')::numeric,0) efectivo from jsonb_array_elements(coalesce(v_cash->'days','[]'::jsonb)) x
  ), vd as (
    select (x->>'fecha')::date dia, sum(coalesce((x->>'venta')::numeric,0)) ventas, count(*) n, sum((x->>'comision')::numeric) com from jsonb_array_elements(v_ventas) x group by 1
  ), dias as (
    select dia from j union select dia from sv union select dia from cash where efectivo<>0 union select dia from vd
  )
  select coalesce(jsonb_agg(jsonb_build_object('fecha',d.dia,'moviles',j.moviles,'km',coalesce(j.km,0),'jornadas',coalesce(j.jornadas,0),'abierta',coalesce(j.abierta,false),
           'servicios',coalesce(sv.n,0),'ventas',coalesce(vd.ventas,0),'n_ventas',coalesce(vd.n,0),'comision',coalesce(vd.com,0),'efectivo',coalesce(c.efectivo,0)) order by d.dia nulls last),'[]')
    into v_dias
  from dias d left join j on j.dia=d.dia left join sv on sv.dia=d.dia left join cash c on c.dia=d.dia left join vd on vd.dia is not distinct from d.dia;
  return jsonb_build_object('liquidacion_id',l.liquidacion_id,'driver_id',l.driver_id,'dias',v_dias,'ventas',v_ventas,
    'efectivo_total',coalesce((v_cash->>'expected')::numeric,0),'comision_total',l.commission_total);
end $f$;
revoke all on function app_private.payroll_desglose_core_v1(uuid) from public,anon,authenticated;

create or replace function public.payroll_desglose_v1(p_liquidacion uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $f$
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'') not in ('administracion','supervision') then raise exception 'No autorizado'; end if;
  return app_private.payroll_desglose_core_v1(p_liquidacion);
end $f$;
revoke all on function public.payroll_desglose_v1(uuid) from public,anon;
grant execute on function public.payroll_desglose_v1(uuid) to authenticated;

create or replace function public.payroll_desglose_mes_v1(p_period integer) returns jsonb
language plpgsql stable security definer set search_path='' as $f$
declare out jsonb:='[]'; r record;
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'') not in ('administracion','supervision') then raise exception 'No autorizado'; end if;
  for r in select liquidacion_id from public.payroll_liquidaciones where periodo_yyyymm=p_period loop
    out:=out||jsonb_build_array(app_private.payroll_desglose_core_v1(r.liquidacion_id));
  end loop;
  return out;
end $f$;
revoke all on function public.payroll_desglose_mes_v1(integer) from public,anon;
grant execute on function public.payroll_desglose_mes_v1(integer) to authenticated;
