-- Panel · Facturación: Total peajes cuenta solo los peajes que facturamos.
--
-- Antes sumaba todas las líneas de operator_service_tolls del servicio
-- (20260925125312_dashboard_toll_lines_total_fix, aplicada desde el dashboard
-- de Supabase sin archivo en el repo; esta migración la supera). Eso incluía
-- los peajes que paga el cliente, los planificados de un remito ya revisado
-- (que se reemplazan por los reales) y los de prestadoras sin peajes.
-- Con datos del 25/09: $270.600 → $81.300.
--
-- La regla es la de la mesa de Peajes de Facturación
-- (list_operator_billing_tolls_v2), con dos diferencias a propósito:
--   · No excluye lo ya facturado: el Panel mide lo facturable del período,
--     esté o no en una factura.
--   · Cuenta también los peajes que se facturan dentro del servicio
--     (toll_billing_mode = 'with_service'); la mesa lista solo los que van en
--     línea aparte ('separate'). Se excluye solo 'not_applicable'.
-- Y es null-safe con los servicios sin remito: ahí valen los planificados y
-- manuales (en la mesa, el NOT sobre un remito NULL da NULL y los deja afuera).
--
-- Solo servicios finalizados, como el resto de las métricas de la función.

do $migration$
declare
  v_oid oid;
  v_sql text;
  v_before text;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'dashboard_facturacion_v1'
  order by p.oid desc
  limit 1;

  if v_oid is null then
    raise exception 'No existe public.dashboard_facturacion_v1';
  end if;

  select pg_get_functiondef(v_oid) into v_sql;
  v_before := v_sql;
  v_sql := replace(
    v_sql,
    'coalesce((select sum(t.total_amount) from public.operator_service_tolls t where t.service_id=s.service_id), s.toll_total, 0) as peajes,',
    $new$coalesce((
        select sum(t.total_amount)
        from public.operator_service_tolls t
        where t.service_id = s.service_id
          and t.payer_agent = 'provider'
          and coalesce(t.total_amount, 0) > 0
          and case
                when coalesce(r.addons_version = 2
                              and r.addons_review_status in ('approved', 'adjusted')
                              and s.document_status = 'approved', false)
                  then t.source = 'actual'
                else t.source in ('planned', 'manual')
              end
      ), 0) *
      case when coalesce((
        select bs.toll_calculation_mode <> 'not_applicable'
        from public.company_billing_settings bs
        where bs.company_id = s.company_id
          and bs.is_active
          and bs.valid_from <= (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date
          and (bs.valid_until is null
               or bs.valid_until >= (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date)
          and (bs.contract_id is null or bs.contract_id = s.contract_id)
        order by (bs.contract_id = s.contract_id) desc nulls last, bs.valid_from desc, bs.created_at desc
        limit 1
      ), false) then 1 else 0 end as peajes,$new$
  );

  if v_sql = v_before then
    raise exception 'No se encontró la expresión de peajes esperada en dashboard_facturacion_v1';
  end if;

  execute v_sql;
end;
$migration$;
