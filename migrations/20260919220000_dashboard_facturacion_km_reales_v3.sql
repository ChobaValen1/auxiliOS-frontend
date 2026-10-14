-- Facturación v3: KM REALES y el margen contra lo facturado.
--
-- km_reales lo informa el chofer en el remito; los km facturados salen del
-- asfalto + ripio del servicio. La pregunta que responde el margen es si lo que
-- se factura cubre lo que se recorre.
--
-- Una cosa importante de cómo está calculado: el margen se saca SÓLO sobre los
-- servicios que tienen km_reales informado, y los km facturados de ese mismo
-- subconjunto. Sumar todos los facturados contra los pocos reales daría un
-- margen inventado. Por eso el payload trae `servicios_con_dato` además del
-- total: un margen sobre 3 de 200 servicios no se lee igual que uno sobre 190.
--
-- km_reales <= 0 se trata como "no informado", no como cero kilómetros: un
-- remolque de cero km no existe, y contarlo como cero rompería el promedio.

begin;

-- El dashboard barre por rango de fecha sobre el mismo subconjunto siempre.
-- El predicado del índice parcial está escrito igual que el WHERE de la función
-- (is_test = false, no = 'no es true') para que el planner lo pueda usar.
create index if not exists operator_services_facturacion_periodo_idx
  on public.operator_services (scheduled_for desc)
  where is_test = false and status <> 'cancelled';

create or replace function public.dashboard_facturacion_v1(
  p_desde date default null,
  p_hasta date default null,
  p_empresas uuid[] default null,
  p_bases uuid[] default null,
  p_conceptos uuid[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_role  text := app_private.current_auxilios_role();
  v_hasta date := coalesce(p_hasta, (now() at time zone 'America/Argentina/Buenos_Aires')::date);
  v_desde date := coalesce(p_desde, coalesce(p_hasta, (now() at time zone 'America/Argentina/Buenos_Aires')::date) - 29);
  v_dias       integer;
  v_prev_desde date;
  v_prev_hasta date;
  v_out        jsonb;
begin
  -- Facturación la ven administración y facturación; supervisión lee todo.
  if v_role is null or v_role not in ('administracion', 'facturacion', 'supervision') then
    raise exception 'Sin permiso para ver las métricas de Facturación';
  end if;
  if v_desde > v_hasta then
    raise exception 'Período inválido: "desde" es posterior a "hasta"';
  end if;

  -- El período anterior tiene exactamente la misma cantidad de días y termina el
  -- día antes de que arranque el actual: si no, el comparativo compara peras con
  -- manzanas (un mes de 28 contra uno de 31).
  v_dias       := (v_hasta - v_desde) + 1;
  v_prev_hasta := v_desde - 1;
  v_prev_desde := v_desde - v_dias;

  with base as (
    select
      case
        when (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date >= v_desde
          then 'actual'
        else 'anterior'
      end as tramo,
      s.company_id,
      s.billing_base_id,
      s.primary_concept_id,
      coalesce(s.company_estimated_total, 0) as monto,
      coalesce(s.toll_total, 0)              as peajes,
      case
        when coalesce(s.estimated_asphalt_km, 0) + coalesce(s.estimated_gravel_km, 0) > 0
          then coalesce(s.estimated_asphalt_km, 0) + coalesce(s.estimated_gravel_km, 0)
        else coalesce(s.estimated_distance_km, 0)
      end as km,
      s.currency,
      -- Null cuando el chofer no lo informó: así no entra al margen.
      case when coalesce(r.km_reales, 0) > 0 then r.km_reales end as km_real
    from public.operator_services s
    left join public.remitos r on r.remito_id = s.remito_id
    where s.is_test = false
      and s.status <> 'cancelled'
      and (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date
            between v_prev_desde and v_hasta
      and (p_empresas  is null or cardinality(p_empresas)  = 0 or s.company_id         = any (p_empresas))
      and (p_bases     is null or cardinality(p_bases)     = 0 or s.billing_base_id    = any (p_bases))
      and (p_conceptos is null or cardinality(p_conceptos) = 0 or s.primary_concept_id = any (p_conceptos))
  ),
  tot as (
    select
      count(*)                       filter (where tramo = 'actual')   as n_act,
      coalesce(sum(monto)            filter (where tramo = 'actual'), 0)   as f_act,
      coalesce(sum(peajes)           filter (where tramo = 'actual'), 0)   as p_act,
      coalesce(sum(km)               filter (where tramo = 'actual'), 0)   as k_act,
      count(*)                       filter (where tramo = 'anterior') as n_ant,
      coalesce(sum(monto)            filter (where tramo = 'anterior'), 0) as f_ant,
      coalesce(sum(peajes)           filter (where tramo = 'anterior'), 0) as p_ant,
      coalesce(sum(km)               filter (where tramo = 'anterior'), 0) as k_ant,
      count(distinct currency)       filter (where tramo = 'actual')   as monedas,
      min(currency)                  filter (where tramo = 'actual')   as moneda,
      -- Los tres se calculan sobre el mismo subconjunto: los servicios con
      -- km_reales informado. Comparar sumas de conjuntos distintos daría un
      -- margen que no significa nada.
      coalesce(sum(km_real) filter (where tramo = 'actual' and km_real is not null), 0) as kr_act,
      coalesce(sum(km)      filter (where tramo = 'actual' and km_real is not null), 0) as kfc_act,
      count(*)              filter (where tramo = 'actual' and km_real is not null)     as n_comp_act,
      coalesce(sum(km_real) filter (where tramo = 'anterior' and km_real is not null), 0) as kr_ant,
      coalesce(sum(km)      filter (where tramo = 'anterior' and km_real is not null), 0) as kfc_ant
    from base
  )
  select jsonb_build_object(
    'desde', v_desde,
    'hasta', v_hasta,
    'dias',  v_dias,
    'comparativo', jsonb_build_object('desde', v_prev_desde, 'hasta', v_prev_hasta),
    -- hay_datos separa "no hay servicios cargados" de "el período dio cero":
    -- sin esto la UI no puede saber si mostrar $0 o el estado vacío.
    'hay_datos',          t.n_act > 0,
    'hay_datos_anterior', t.n_ant > 0,
    -- null cuando el período mezcla monedas: sumar ARS con USD no daría un total.
    'moneda', case when t.monedas = 1 then t.moneda else null end,
    'totales', jsonb_build_object(
      'facturado', round(t.f_act, 2),
      'peajes',    round(t.p_act, 2),
      'km',        round(t.k_act, 2),
      'servicios', t.n_act
    ),
    'anterior', jsonb_build_object(
      'facturado', round(t.f_ant, 2),
      'peajes',    round(t.p_ant, 2),
      'km',        round(t.k_ant, 2),
      'km_reales', round(t.kr_ant, 2),
      'servicios', t.n_ant
    ),

    -- Bloque propio para que el front no tenga que saber sobre qué subconjunto
    -- está calculado el margen: viaja junto con él.
    'reales', jsonb_build_object(
      'km_reales',           round(t.kr_act, 2),
      'km_facturados',       round(t.kfc_act, 2),
      'servicios_con_dato',  t.n_comp_act,
      'servicios',           t.n_act,
      'margen',
        case when t.kr_act > 0
             then round((t.kfc_act - t.kr_act) * 100 / t.kr_act, 1) end,
      'margen_anterior',
        case when t.kr_ant > 0
             then round((t.kfc_ant - t.kr_ant) * 100 / t.kr_ant, 1) end
    ),
    'por_empresa', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',        g.id,
               'nombre',    g.nombre,
               'monto',     round(g.monto, 2),
               'servicios', g.servicios,
               'km',        round(g.km, 2))
             order by g.monto desc, g.servicios desc, g.nombre)
      from (
        select b.company_id                                            as id,
               coalesce(c.trade_name, c.legal_name, 'Sin prestadora')  as nombre,
               sum(b.monto) as monto, count(*) as servicios, sum(b.km) as km
        from base b
        left join public.companies c on c.company_id = b.company_id
        where b.tramo = 'actual'
        group by b.company_id, coalesce(c.trade_name, c.legal_name, 'Sin prestadora')
      ) g
    ), '[]'::jsonb),
    'por_concepto', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',        g.id,
               'nombre',    g.nombre,
               'monto',     round(g.monto, 2),
               'servicios', g.servicios,
               'km',        round(g.km, 2))
             order by g.servicios desc, g.monto desc, g.nombre)
      from (
        select b.primary_concept_id           as id,
               coalesce(sc.name, 'Sin concepto') as nombre,
               sum(b.monto) as monto, count(*) as servicios, sum(b.km) as km
        from base b
        left join public.service_concepts sc on sc.concept_id = b.primary_concept_id
        where b.tramo = 'actual'
        group by b.primary_concept_id, coalesce(sc.name, 'Sin concepto')
      ) g
    ), '[]'::jsonb),
    'por_base', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',        g.id,
               'nombre',    g.nombre,
               'monto',     round(g.monto, 2),
               'servicios', g.servicios,
               'km',        round(g.km, 2),
               'km_real',   round(g.km_real, 2),
               -- Los facturados del mismo subconjunto que los reales: el front
               -- divide estos dos y no dos totales que no se corresponden.
               'km_comparable', round(g.km_comp, 2),
               'servicios_con_dato', g.servicios_con_dato)
             order by g.monto desc, g.servicios desc, g.nombre)
      from (
        -- billing_base_id es nullable: los servicios sin base van a "Sin base"
        -- en vez de desaparecer del desglose.
        select b.billing_base_id            as id,
               coalesce(bb.name, 'Sin base') as nombre,
               sum(b.monto) as monto, count(*) as servicios, sum(b.km) as km,
               coalesce(sum(b.km_real) filter (where b.km_real is not null), 0) as km_real,
               coalesce(sum(b.km)      filter (where b.km_real is not null), 0) as km_comp,
               count(*)                filter (where b.km_real is not null)     as servicios_con_dato
        from base b
        left join public.billing_bases bb on bb.base_id = b.billing_base_id
        where b.tramo = 'actual'
        group by b.billing_base_id, coalesce(bb.name, 'Sin base')
      ) g
    ), '[]'::jsonb)
,

    -- Con qué llenar los combos de prestadora y base. Se incluyen las inactivas
    -- que tengan servicios en el período: si no, un servicio quedaría filtrado
    -- por una opción que no existe en la lista.
    'catalogo', jsonb_build_object(
      'empresas', coalesce((
        select jsonb_agg(jsonb_build_object('id', c.company_id, 'nombre', c.nombre)
                         order by c.nombre)
        from (
          select co.company_id,
                 coalesce(nullif(btrim(co.trade_name), ''), co.legal_name, 'Sin nombre') as nombre
          from public.companies co
          where coalesce(co.is_test, false) = false
            and (coalesce(co.status, 'active') = 'active'
              or exists (select 1 from base b
                         where b.tramo = 'actual' and b.company_id = co.company_id))
        ) c
      ), '[]'::jsonb),
      'bases', coalesce((
        select jsonb_agg(jsonb_build_object('id', b2.base_id, 'nombre', b2.nombre)
                         order by b2.nombre)
        from (
          select bb.base_id,
                 coalesce(nullif(btrim(bb.name), ''), bb.base_code, 'Sin nombre') as nombre
          from public.billing_bases bb
          where coalesce(bb.is_active, true)
             or exists (select 1 from base b
                        where b.tramo = 'actual' and b.billing_base_id = bb.base_id)
        ) b2
      ), '[]'::jsonb)
    )
  )
  into v_out
  from tot t;

  return v_out;
end;
$function$;

comment on function public.dashboard_facturacion_v1(date, date, uuid[], uuid[], uuid[]) is
  'Métricas agregadas de la sección FACTURACIÓN del dashboard: totales del período, del período anterior de igual duración, cortes por empresa, concepto y base, el catálogo de prestadoras y bases para los combos de filtro, y los KM reales informados en el remito con su margen contra lo facturado. El margen se calcula sólo sobre los servicios que tienen km_reales, y el payload informa cuántos son para que no se lea un margen de tres servicios como si fuera de doscientos. El catálogo no se filtra por los filtros activos y sale de companies/billing_bases, así que funciona con operator_services vacía. Excluye servicios de prueba y cancelados.';

revoke all on function public.dashboard_facturacion_v1(date, date, uuid[], uuid[], uuid[]) from public, anon;
grant execute on function public.dashboard_facturacion_v1(date, date, uuid[], uuid[], uuid[]) to authenticated, service_role;

commit;
