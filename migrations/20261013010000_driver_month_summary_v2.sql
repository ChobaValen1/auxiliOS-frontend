-- Resumen del chofer, etapa 2: suma a get_driver_month_summary_v1 el efectivo
-- día por día (para ver qué jornada quedó sin rendir) y los últimos 5 remitos
-- del mes. Sólo agrega claves a la respuesta; sigue siendo sólo lectura.

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
  v_from date; v_prev date; v_cash jsonb; v_rendido numeric; v_dias jsonb; v_ultimos jsonb;
begin
  if auth.uid() is null or v_role = '' then raise exception 'Sin permiso'; end if;
  if v_driver <> auth.uid() and v_role not in ('administracion','supervision') then raise exception 'Sin permiso'; end if;
  if p_period is null or p_period/100 not between 2000 and 2199 or p_period%100 not between 1 and 12 then raise exception 'Período inválido'; end if;
  v_from := make_date(p_period/100, p_period%100, 1);
  v_prev := (v_from - interval '1 month')::date;
  v_cash := app_private.monthly_cash_source(v_driver, p_period);

  with rend as (
    select j.log_date fecha, sum(coalesce(c.efectivo_declarado,0)) rendido
      from public.rendicion_cierre c join public.daily_logs j on j.log_id = c.log_id
     where j.driver_id = v_driver and c.estado <> 'rechazado'
       and j.log_date >= v_from and j.log_date < (v_from + interval '1 month')::date
     group by j.log_date
  ), dias as (
    select (d->>'fecha')::date fecha, coalesce((d->>'expected')::numeric,0) cobrado, coalesce((d->>'expenses')::numeric,0) gastos
      from jsonb_array_elements(coalesce(v_cash->'days','[]'::jsonb)) d
  )
  select coalesce(sum(r.rendido),0),
         coalesce(jsonb_agg(jsonb_build_object(
           'fecha', coalesce(d.fecha, r.fecha), 'cobrado', coalesce(d.cobrado,0), 'gastos', coalesce(d.gastos,0),
           'rendido', coalesce(r.rendido,0),
           'pendiente', greatest(0, coalesce(d.cobrado,0) - coalesce(d.gastos,0) - coalesce(r.rendido,0)))
           order by coalesce(d.fecha, r.fecha)) filter (where coalesce(d.cobrado,0) + coalesce(d.gastos,0) + coalesce(r.rendido,0) > 0), '[]'::jsonb)
    into v_rendido, v_dias
    from dias d full join rend r on r.fecha = d.fecha;

  select coalesce(jsonb_agg(x order by x->>'creado' desc), '[]'::jsonb) into v_ultimos from (
    select jsonb_build_object(
             'remito_id', r.remito_id, 'nro_remito', r.nro_remito, 'nro_servicio', r.nro_servicio,
             'patente', r.patente, 'origen', coalesce(r.origin_formatted_address, r.origen),
             'destino', coalesce(r.destination_formatted_address, r.destino),
             'status', r.status, 'creado', r.created_at_device, 'km', r.km_reales) x
      from public.remitos r join public.daily_logs j on j.log_id = r.log_id
     where j.driver_id = v_driver and r.status <> 'anulado'
       and j.log_date >= v_from and j.log_date < (v_from + interval '1 month')::date
     order by r.created_at_device desc nulls last
     limit 5) t;

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
      'pendiente', greatest(0, coalesce((v_cash->>'due')::numeric, 0) - v_rendido),
      'dias', v_dias),
    'ultimos', v_ultimos,
    'generado_at', now());
end $function$;

revoke all on function public.get_driver_month_summary_v1(integer, uuid) from public, anon;
grant execute on function public.get_driver_month_summary_v1(integer, uuid) to authenticated;
