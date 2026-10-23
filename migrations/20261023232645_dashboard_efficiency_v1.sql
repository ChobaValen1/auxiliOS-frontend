-- Read-only: billing kilometres of completed own-fleet services versus odometer.
-- Date attribution deliberately matches dashboard_facturacion_v1 (scheduled_for).
create or replace function app_private.dashboard_efficiency_core_v1(
 p_desde date, p_hasta date, p_empresas uuid[], p_bases uuid[], p_conceptos uuid[], p_hoy date
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
 d date := coalesce(p_desde, coalesce(p_hasta,p_hoy)-29);
 h date := least(coalesce(p_hasta,p_hoy),p_hoy);
 dias integer;
 prev date;
 result jsonb;
begin
 if coalesce(p_hasta,p_hoy)<d or coalesce(p_hasta,p_hoy)-d>730 then
   raise exception 'Elegí un período de hasta 731 días' using errcode='22023';
 end if;
 dias := greatest(h-d+1,0);
 prev := d-dias;
 with servicios as (
   select (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date dia,
     case when coalesce(s.estimated_asphalt_km,0)+coalesce(s.estimated_gravel_km,0)>0
       then coalesce(s.estimated_asphalt_km,0)+coalesce(s.estimated_gravel_km,0)
       else s.estimated_distance_km end km
   from public.operator_services s
   where not s.is_test and s.status='completed' and s.logistics_type='own'
     and s.scheduled_for >= (prev::timestamp at time zone 'America/Argentina/Buenos_Aires')
     and s.scheduled_for < ((h+1)::timestamp at time zone 'America/Argentina/Buenos_Aires')
     and (coalesce(cardinality(p_empresas),0)=0 or s.company_id=any(p_empresas))
     and (coalesce(cardinality(p_bases),0)=0 or s.billing_base_id=any(p_bases))
     and (coalesce(cardinality(p_conceptos),0)=0 or s.primary_concept_id=any(p_conceptos))
 ), fact as (
   select dia,sum(km) filter(where km>=0) km,count(*) filter(where km is null or km<0) faltan
   from servicios group by dia
 ), jornadas as (
   select l.log_date dia, l.status, l.km_final-l.km_inicio km,
     l.status='closed' and l.km_inicio is not null and l.km_final>=l.km_inicio valido
   from public.daily_logs l join public.trucks t on t.truck_id=l.truck_id
   where not coalesce(t.is_test,false) and l.status in ('open','closed')
     and l.log_date between prev and h
 ), odo as (
   select dia,sum(km) filter(where valido) km,count(*) jornadas,
     count(*) filter(where not coalesce(valido,false)) faltan
   from jornadas group by dia
 ), prueba as (
   select l.driver_id from public.daily_logs l join public.trucks t on t.truck_id=l.truck_id
   group by l.driver_id having bool_and(coalesce(t.is_test,false))
 ), pendientes as (
   select (r.created_at_device at time zone 'America/Argentina/Buenos_Aires')::date dia,count(*) faltan
   from public.remitos r where r.status='firmado'
     and r.created_at_device >= (prev::timestamp at time zone 'America/Argentina/Buenos_Aires')
     and r.created_at_device < ((h+1)::timestamp at time zone 'America/Argentina/Buenos_Aires')
     and not exists(select 1 from prueba p where p.driver_id=r.driver_id)
     and not exists(select 1 from public.operator_services s where s.remito_id=r.remito_id)
   group by 1
 ), diario as (
   select fecha::date dia, case when fecha::date>=d then 'actual' else 'anterior' end periodo,
     case when coalesce(f.faltan,0)=0 then coalesce(f.km,0) end facturados,
     case when coalesce(o.faltan,0)=0 then coalesce(o.km,0) end odometro,
     coalesce(f.faltan,0) servicios_sin_km, coalesce(o.faltan,0) cierres_faltantes,
     coalesce(o.jornadas,0) jornadas,coalesce(p.faltan,0) remitos_sin_servicio
   from pg_catalog.generate_series(prev::timestamp,h::timestamp,interval '1 day') fecha
   left join fact f on f.dia=fecha::date left join odo o on o.dia=fecha::date
   left join pendientes p on p.dia=fecha::date
 ), periodos as (
   select periodo,jsonb_build_object(
     'filas',jsonb_agg(to_jsonb(diario)-'periodo' order by dia),
     'facturados',case when sum(servicios_sin_km)=0 then sum(facturados) end,
     'odometro',case when sum(cierres_faltantes)=0 then sum(odometro) end,
     'servicios_sin_km',sum(servicios_sin_km),'cierres_faltantes',sum(cierres_faltantes),
     'jornadas',sum(jornadas),'remitos_sin_servicio',sum(remitos_sin_servicio)) datos
   from diario group by periodo
 ) select jsonb_build_object('desde',d,'hasta',h,'hasta_solicitado',coalesce(p_hasta,p_hoy),
   'anterior_desde',prev,'anterior_hasta',d-1,'actualizado',now(),
   'filtrado',coalesce(cardinality(p_empresas),0)+coalesce(cardinality(p_bases),0)+coalesce(cardinality(p_conceptos),0)>0,
   'actual',(select datos from periodos where periodo='actual'),
   'anterior',(select datos from periodos where periodo='anterior')) into result;
 return result;
end $$;
revoke all on function app_private.dashboard_efficiency_core_v1(date,date,uuid[],uuid[],uuid[],date) from public,anon,authenticated;

create or replace function public.dashboard_efficiency_v1(
 p_desde date default null,p_hasta date default null,p_empresas uuid[] default null,
 p_bases uuid[] default null,p_conceptos uuid[] default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 if auth.uid() is null or coalesce(public.current_auxilios_role(),'') not in ('administracion','facturacion','supervision') then
   raise exception 'No autorizado' using errcode='42501';
 end if;
 return app_private.dashboard_efficiency_core_v1(p_desde,p_hasta,p_empresas,p_bases,p_conceptos,
   (now() at time zone 'America/Argentina/Buenos_Aires')::date);
end $$;
revoke all on function public.dashboard_efficiency_v1(date,date,uuid[],uuid[],uuid[]) from public,anon;
grant execute on function public.dashboard_efficiency_v1(date,date,uuid[],uuid[],uuid[]) to authenticated;
