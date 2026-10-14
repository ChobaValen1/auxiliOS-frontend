-- Resumen del chofer, etapa 3: "Lo que llevo ganado" (estimado).
-- El cálculo de Sueldos (PayrollMatrix.calculate en la app) necesita el esquema
-- de pago, las comisiones asignadas y las fuentes de get_payroll_matrix_sources,
-- que sólo leen Administración y Supervisión. Para no duplicar esa cuenta:
--   1) el cuerpo de get_payroll_matrix_sources pasa a app_private.payroll_matrix_sources_core
--      (sin cambios), y la función pública lo llama con el mismo control de permisos;
--   2) get_driver_payroll_estimate_v1 le da al chofer SÓLO lo suyo para que la app
--      haga la misma cuenta que Sueldos. Sólo lectura.

create or replace function app_private.payroll_matrix_sources_core(p_driver uuid, p_from date, p_until date)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
 select jsonb_build_object(
 'invoices',coalesce((select jsonb_agg(jsonb_build_object('id',l.invoice_service_id,'service_id',s.service_id,'concept_id',s.primary_concept_id,'quantity',1,'amount',coalesce(nullif(l.quote_snapshot->>'service_company_amount','')::numeric,l.company_amount),'currency',l.currency,'km',case when l.quote_snapshot ? 'billable_asphalt_km' and l.quote_snapshot ? 'billable_gravel_km' then coalesce((l.quote_snapshot->>'billable_asphalt_km')::numeric,0)+coalesce((l.quote_snapshot->>'billable_gravel_km')::numeric,0) else null end)) from public.operator_invoice_services l join public.operator_invoices i using(invoice_id) join public.operator_services s using(service_id) join public.companies c on c.company_id=s.company_id where c.client_kind<>'particular' and s.assigned_driver_id=p_driver and l.released_at is null and i.status='created' and (i.created_at at time zone 'America/Argentina/Buenos_Aires')::date>=p_from and (i.created_at at time zone 'America/Argentina/Buenos_Aires')::date<p_until),'[]'::jsonb)
 ||coalesce((select jsonb_agg(jsonb_build_object('id','part:'||s.service_id,'service_id',s.service_id,'remito_id',r.remito_id,'concept_id',s.primary_concept_id,'quantity',1,'amount',s.quoted_total,'currency','ARS','km',r.km_reales,'client_kind','particular')) from public.operator_services s join public.companies c on c.company_id=s.company_id join lateral (select x.remito_id,x.km_reales,x.firmado_at from public.remitos x where x.operator_service_id=s.service_id and x.driver_id=p_driver and x.status='firmado' order by x.firmado_at desc limit 1) r on true where c.client_kind='particular' and s.quoted_total is not null and (r.firmado_at at time zone 'America/Argentina/Buenos_Aires')::date>=p_from and (r.firmado_at at time zone 'America/Argentina/Buenos_Aires')::date<p_until),'[]'::jsonb),
 'extras',coalesce((select jsonb_agg(jsonb_build_object('id',e.excess_report_id,'remito_id',r.remito_id,'concept_id',e.concept_id,'quantity',e.quantity,'amount',e.total_amount,'currency',e.currency)) from public.remito_excess_reports e join public.remitos r using(remito_id) where r.driver_id=p_driver and r.status='firmado' and e.customer_payment_method<>'not_collected' and (r.firmado_at at time zone 'America/Argentina/Buenos_Aires')::date>=p_from and (r.firmado_at at time zone 'America/Argentina/Buenos_Aires')::date<p_until),'[]'::jsonb)
 ||coalesce((select jsonb_agg(jsonb_build_object('id',t.k,'remito_id',t.remito_id,'service_id',t.service_id,'concept_id',t.concept_id,'quantity',1,'amount',0,'currency','ARS')) from (select distinct on (k) 'tog:'||coalesce(r.operator_service_id::text,'r'||r.remito_id)||':'||m.concept_id as k,r.remito_id,r.operator_service_id as service_id,m.concept_id from public.remitos r join public.service_toggle_marks m on m.is_on and ((m.source='driver' and m.remito_id=r.remito_id) or (m.source='operator' and m.service_id=r.operator_service_id)) join public.service_concepts sc on sc.concept_id=m.concept_id and sc.input_mode='toggle' where r.driver_id=p_driver and r.status='firmado' and (r.firmado_at at time zone 'America/Argentina/Buenos_Aires')::date>=p_from and (r.firmado_at at time zone 'America/Argentina/Buenos_Aires')::date<p_until order by k,r.firmado_at desc) t),'[]'::jsonb),
 'captacion',coalesce((select jsonb_agg(jsonb_build_object('id','capt:'||s.service_id,'service_id',s.service_id,'remito_id',r.remito_id,'concept_id',null,'quantity',1,'amount',coalesce((select sum(p.amount) from public.service_payments p where p.service_id=s.service_id and p.voided_at is null),0),'currency','ARS')) from public.operator_services s join lateral (select x.remito_id,x.firmado_at from public.remitos x where x.operator_service_id=s.service_id and x.status='firmado' order by x.firmado_at desc limit 1) r on true where s.referred_by_driver_id=p_driver and (r.firmado_at at time zone 'America/Argentina/Buenos_Aires')::date>=p_from and (r.firmado_at at time zone 'America/Argentina/Buenos_Aires')::date<p_until),'[]'::jsonb));
$function$;
revoke all on function app_private.payroll_matrix_sources_core(uuid, date, date) from public, anon, authenticated;

create or replace function public.get_payroll_matrix_sources(p_driver uuid, p_from date, p_until date)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
begin
 if coalesce(app_private.current_auxilios_role(),'') not in ('administracion','supervision') then raise exception 'No autorizado'; end if;
 if p_driver is null or p_from is null or p_until is null or p_until<=p_from or p_until-p_from>32 then raise exception 'Período inválido'; end if;
 return app_private.payroll_matrix_sources_core(p_driver, p_from, p_until);
end $function$;

create or replace function public.get_driver_payroll_estimate_v1(p_period integer, p_driver uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_driver uuid := coalesce(p_driver, auth.uid());
  v_role text := coalesce(app_private.current_auxilios_role(), '');
  v_from date; v_until date; v_settings jsonb; v_rules jsonb; v_liq jsonb; v_cash jsonb;
begin
  if auth.uid() is null or v_role = '' then raise exception 'Sin permiso'; end if;
  if v_driver <> auth.uid() and v_role not in ('administracion','supervision') then raise exception 'Sin permiso'; end if;
  if p_period is null or p_period/100 not between 2000 and 2199 or p_period%100 not between 1 and 12 then raise exception 'Período inválido'; end if;
  v_from := make_date(p_period/100, p_period%100, 1);
  v_until := (v_from + interval '1 month')::date;

  select jsonb_build_object('sueldo_basico', s.sueldo_basico, 'valor_km', s.valor_km, 'valor_servicio', s.valor_servicio,
                            'bono_presentismo', s.bono_presentismo, 'compensation_matrix', coalesce(s.compensation_matrix, '{}'::jsonb))
    into v_settings from public.payroll_settings s where s.user_id = v_driver;

  select coalesce(jsonb_agg(jsonb_build_object('commission_id', r.commission_id, 'name', r.name, 'concept_id', r.concept_id,
                                               'source', r.source, 'mode', r.mode, 'value', r.value) order by r.name), '[]'::jsonb)
    into v_rules
    from public.payroll_commission_rules r join public.payroll_commission_assignments a on a.commission_id = r.commission_id
   where a.driver_id = v_driver and r.active is not false;

  select jsonb_build_object('estado', l.estado, 'total', l.total, 'ajuste_rendiciones', l.ajuste_rendiciones)
    into v_liq from public.payroll_liquidaciones l
   where l.driver_id = v_driver and l.periodo_yyyymm = p_period and l.estado in ('aprobada','pagada');

  v_cash := app_private.monthly_cash_source(v_driver, p_period);

  return jsonb_build_object(
    'period', p_period,
    'driver_id', v_driver,
    'settings', v_settings,
    'commissions', v_rules,
    'sources', app_private.payroll_matrix_sources_core(v_driver, v_from, v_until),
    'jornadas', coalesce((select jsonb_agg(jsonb_build_object('status', j.status, 'km_inicio', j.km_inicio, 'km_final', j.km_final))
                            from public.daily_logs j
                           where j.driver_id = v_driver and j.status = 'closed' and j.log_date >= v_from and j.log_date < v_until), '[]'::jsonb),
    'servicios', (select count(*) from public.remitos r
                   where r.driver_id = v_driver and r.status = 'firmado'
                     and r.created_at_device >= (v_from::timestamp at time zone 'America/Argentina/Buenos_Aires')
                     and r.created_at_device < (v_until::timestamp at time zone 'America/Argentina/Buenos_Aires')),
    'incidentes', (select count(*) from public.incidents i
                    where i.driver_id = v_driver
                      and i.created_at_device >= (v_from::timestamp at time zone 'America/Argentina/Buenos_Aires')
                      and i.created_at_device < (v_until::timestamp at time zone 'America/Argentina/Buenos_Aires')),
    'descuento_rendicion', coalesce((v_cash->>'discount')::numeric, 0),
    'liquidacion', v_liq,
    'generado_at', now());
end $function$;

revoke all on function public.get_driver_payroll_estimate_v1(integer, uuid) from public, anon;
grant execute on function public.get_driver_payroll_estimate_v1(integer, uuid) to authenticated;
