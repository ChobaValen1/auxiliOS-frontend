-- Opt-in preview: existing production RPCs and saved payroll receipts are unchanged.
-- A sale follows the service's responsible driver, not the user who entered it.
-- Canonical precedence: administrative correction > actual charges > signed report.
-- Tariff service items are a fallback only when that concept has no reported charge.
create or replace function app_private.payroll_sales_v3(p_driver uuid,p_from date,p_until date)
returns jsonb language sql stable security definer set search_path='' as $f$
with services as (
 select s.*,c.driver_id as beneficiary_driver_id,c.remito_id as signed_remito_id
 from app_private.completed_driver_services_v2() c join public.operator_services s using(service_id)
 where c.driver_id=p_driver
 and c.completed_at >= (p_from::timestamp at time zone 'America/Argentina/Buenos_Aires')
 and c.completed_at < (p_until::timestamp at time zone 'America/Argentina/Buenos_Aires')
), lines as (
 select s.service_id,s.beneficiary_driver_id,(e->>'concept_id')::uuid concept_id,
 (e->>'quantity')::numeric quantity,(e->>'total_amount')::numeric amount,
 coalesce(e->>'currency','ARS') currency,'administrative' origin
 from services s cross join lateral jsonb_array_elements(coalesce(s.administrative_commercial->'excess_charges','[]'::jsonb)) e
 where coalesce(e->>'payer_agent','customer')='customer'
 and coalesce(e->>'collector_agent','company')='company'
 and coalesce(s.administrative_commercial#>>'{customer_payment,primary}',e->>'customer_payment_method') in ('cash','transfer','card','mercado_pago','other')
 union all
 select s.service_id,s.beneficiary_driver_id,e.concept_id,e.quantity,e.total_amount,e.currency,'actual'
 from services s join public.operator_service_excess_charges e using(service_id)
 where s.administrative_commercial is null and e.source='actual' and e.payer_agent='customer' and e.collector_agent='company'
 and e.customer_payment_method in ('cash','transfer','card','mercado_pago','other')
 union all
 select s.service_id,s.beneficiary_driver_id,e.concept_id,e.quantity,e.total_amount,e.currency,'driver'
 from services s join public.remito_excess_reports e on e.remito_id=s.signed_remito_id
 where s.administrative_commercial is null and coalesce(s.document_status,'')<>'approved'
 and not exists(select 1 from public.operator_service_excess_charges a where a.service_id=s.service_id and a.source='actual')
 and e.customer_payment_method in ('cash','transfer','card','mercado_pago','other')
 union all
 select s.service_id,s.beneficiary_driver_id,e.concept_id,e.quantity,e.total_amount,e.currency,'operator'
 from services s join public.operator_service_excess_charges e using(service_id)
 where s.administrative_commercial is null and s.signed_remito_id is null and coalesce(s.document_status,'')<>'approved'
 and e.source in ('planned','manual') and e.payer_agent='customer' and e.collector_agent='company'
 and e.customer_payment_method in ('cash','transfer','card','mercado_pago','other')
 and not exists(select 1 from public.operator_service_excess_charges a where a.service_id=s.service_id and a.source='actual')
 union all
 select s.service_id,s.beneficiary_driver_id,i.concept_id,i.quantity,i.subtotal,coalesce(s.currency,'ARS'),'service_item'
 from services s join public.operator_service_items i using(service_id)
 where i.item_role='secondary'
 and not exists(select 1 from public.operator_service_excess_charges e where e.service_id=s.service_id and e.concept_id=i.concept_id)
 and not exists(select 1 from public.remito_excess_reports e where e.remito_id=s.signed_remito_id and e.concept_id=i.concept_id)
 and not exists(select 1 from jsonb_array_elements(coalesce(s.administrative_commercial->'excess_charges','[]'::jsonb)) e where e->>'concept_id'=i.concept_id::text)
), grouped as (
 select service_id,beneficiary_driver_id,concept_id,currency,sum(quantity) quantity,sum(amount) amount,string_agg(distinct origin,',') origin
 from lines where concept_id is not null and quantity>0 and amount>0 group by service_id,beneficiary_driver_id,concept_id,currency
), entries as (
 select jsonb_build_object('id','sale:'||service_id||':'||concept_id||':'||currency,'service_id',service_id,
 'driver_id',beneficiary_driver_id,'concept_id',concept_id,'quantity',quantity,'amount',amount,'currency',currency,'origin',origin) line from grouped
 union all
 select distinct jsonb_build_object('id','tog:'||s.service_id||':'||m.concept_id,'service_id',s.service_id,
 'driver_id',s.beneficiary_driver_id,'concept_id',m.concept_id,'quantity',1,'amount',0,'currency','ARS')
 from services s join public.service_toggle_marks m on m.is_on and ((m.source='operator' and m.service_id=s.service_id) or (m.source='driver' and m.remito_id=s.signed_remito_id))
 join public.service_concepts sc on sc.concept_id=m.concept_id and sc.input_mode='toggle'
) select coalesce(jsonb_agg(line order by line->>'id'),'[]'::jsonb) from entries;
$f$;
revoke all on function app_private.payroll_sales_v3(uuid,date,date) from public,anon,authenticated;

create or replace function app_private.payroll_matrix_sources_v3(p_driver uuid,p_from date,p_until date)
returns jsonb language plpgsql stable security definer set search_path='' as $f$
declare d jsonb; legacy jsonb;
begin
 d:=app_private.payroll_matrix_sources_v2(p_driver,p_from,p_until);
 -- Remove old representations of a completed/cancelled service in every month,
 -- including reports signed later. Standalone legacy reports keep their rule.
 select coalesce(jsonb_agg(x),'[]'::jsonb) into legacy from jsonb_array_elements(d->'extras') x
 where not exists(select 1 from public.operator_services s where s.status in ('completed','cancelled')
 and (s.service_id::text=x->>'service_id' or s.remito_id::text=x->>'remito_id'
 or exists(select 1 from public.remitos r where r.remito_id::text=x->>'remito_id' and r.operator_service_id=s.service_id)));
 return d||jsonb_build_object('extras',legacy||app_private.payroll_sales_v3(p_driver,p_from,p_until));
end $f$;
revoke all on function app_private.payroll_matrix_sources_v3(uuid,date,date) from public,anon,authenticated;

create or replace function public.get_payroll_matrix_sources_v3(p_driver uuid,p_from date,p_until date)
returns jsonb language plpgsql stable security definer set search_path='' as $f$
begin
 if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'') not in ('administracion','supervision') then raise exception 'No autorizado'; end if;
 if p_driver is null or p_from is null or p_until is null or p_until<=p_from or p_until-p_from>32 then raise exception 'Período inválido'; end if;
 return app_private.payroll_matrix_sources_v3(p_driver,p_from,p_until);
end $f$;
revoke all on function public.get_payroll_matrix_sources_v3(uuid,date,date) from public,anon;
grant execute on function public.get_payroll_matrix_sources_v3(uuid,date,date) to authenticated;

create or replace function public.get_driver_payroll_estimate_v3(p_period integer,p_driver uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $f$
declare d jsonb; v_driver uuid:=coalesce(p_driver,auth.uid()); v_from date;
begin
 d:=public.get_driver_payroll_estimate_v2(p_period,p_driver); -- existing role/ownership/period checks
 v_from:=make_date(p_period/100,p_period%100,1);
 return d||jsonb_build_object('sources',app_private.payroll_matrix_sources_v3(v_driver,v_from,(v_from+interval '1 month')::date));
end $f$;
revoke all on function public.get_driver_payroll_estimate_v3(integer,uuid) from public,anon;
grant execute on function public.get_driver_payroll_estimate_v3(integer,uuid) to authenticated;

-- Form metadata is opt-in too: the operator sees available concepts and whether
-- the responsible driver has a commission, without receiving salary/rule values.
create or replace function public.get_operator_service_form_context_v2(p_company_id uuid,p_scheduled_for timestamptz)
returns jsonb language plpgsql stable security definer set search_path='' as $f$
declare d jsonb; concepts jsonb; commissions jsonb;
begin
 if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'') not in ('administracion','operador','supervision','facturacion') then raise exception 'No autorizado'; end if;
 d:=public.get_operator_service_context_v1(p_company_id,p_scheduled_for);
 select coalesce(jsonb_agg(jsonb_build_object('concept_id',sc.concept_id,'name',sc.name,
 'pricing_unit',sc.default_pricing_unit,'code',sc.code) order by sc.sort_order,sc.name),'[]'::jsonb) into concepts
 from public.service_concepts sc where sc.is_active and sc.billing_family<>'system' and sc.service_category in ('secondary','mixed') and sc.input_mode<>'toggle'
 and (sc.code in ('excess_km','extraction','excess_work_hour','excess_wait_hour','excess_traveler','excess_other')
 or exists(select 1 from public.company_service_settings cs where cs.company_id=p_company_id and cs.concept_id=sc.concept_id and cs.is_enabled));
 select coalesce(jsonb_agg(jsonb_build_object('concept_id',r.concept_id,'driver_id',a.driver_id)),'[]'::jsonb) into commissions
 from public.payroll_commission_rules r left join public.payroll_commission_assignments a using(commission_id)
 where r.active and r.source='extras';
 return d||jsonb_build_object('excess_concepts',concepts,'commission_assignments',commissions);
end $f$;
revoke all on function public.get_operator_service_form_context_v2(uuid,timestamptz) from public,anon;
grant execute on function public.get_operator_service_form_context_v2(uuid,timestamptz) to authenticated;
