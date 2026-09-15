alter table public.payroll_settings add column compensation_matrix jsonb not null default '{"km_basis":"real","bonuses":[],"commissions":[]}'::jsonb check(jsonb_typeof(compensation_matrix)='object');
alter table public.payroll_liquidaciones add column bonus_monthly numeric(14,2) not null default 0, add column commission_total numeric(14,2) not null default 0, add column compensation_snapshot jsonb not null default '{}'::jsonb;
create or replace function public.get_payroll_matrix_sources(p_driver uuid,p_from date,p_until date) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if coalesce(app_private.current_auxilios_role(),'') not in ('administracion','supervision') then raise exception 'No autorizado'; end if;
 if p_driver is null or p_from is null or p_until is null or p_until<=p_from or p_until-p_from>32 then raise exception 'Período inválido'; end if;
 return jsonb_build_object(
 'invoices',coalesce((select jsonb_agg(jsonb_build_object('id',l.invoice_service_id,'service_id',s.service_id,'concept_id',s.primary_concept_id,'quantity',1,'amount',coalesce(nullif(l.quote_snapshot->>'service_company_amount','')::numeric,l.company_amount),'currency',l.currency,'km',case when l.quote_snapshot ? 'billable_asphalt_km' and l.quote_snapshot ? 'billable_gravel_km' then coalesce((l.quote_snapshot->>'billable_asphalt_km')::numeric,0)+coalesce((l.quote_snapshot->>'billable_gravel_km')::numeric,0) else null end)) from public.operator_invoice_services l join public.operator_invoices i using(invoice_id) join public.operator_services s using(service_id) where s.assigned_driver_id=p_driver and l.released_at is null and i.status='created' and (i.created_at at time zone 'America/Argentina/Buenos_Aires')::date>=p_from and (i.created_at at time zone 'America/Argentina/Buenos_Aires')::date<p_until),'[]'::jsonb),
 'extras',coalesce((select jsonb_agg(jsonb_build_object('id',e.excess_report_id,'remito_id',r.remito_id,'concept_id',e.concept_id,'quantity',e.quantity,'amount',e.total_amount,'currency',e.currency)) from public.remito_excess_reports e join public.remitos r using(remito_id) where r.driver_id=p_driver and r.status='firmado' and e.customer_payment_method<>'not_collected' and (r.firmado_at at time zone 'America/Argentina/Buenos_Aires')::date>=p_from and (r.firmado_at at time zone 'America/Argentina/Buenos_Aires')::date<p_until),'[]'::jsonb));
end $$;
revoke all on function public.get_payroll_matrix_sources(uuid,date,date) from public,anon;
grant execute on function public.get_payroll_matrix_sources(uuid,date,date) to authenticated;
alter table public.payroll_liquidaciones alter column km_total type numeric(14,2);
-- The previous automatic recalculator does not know the new matrix. Preserve
-- its frozen values and request explicit regeneration rather than losing pay.
do $$ declare definition text; begin
 select pg_get_functiondef(oid) into definition from pg_proc where oid='app_private.recalculate_payroll_impact(uuid,integer,text)'::regprocedure;
 if position('  v_year := p_yyyymm / 100;' in definition)=0 then raise exception 'Unexpected payroll recalculator definition'; end if;
 definition:=replace(definition,'  v_year := p_yyyymm / 100;', E'  if v_liq.compensation_snapshot <> ''{}''::jsonb then\n    update public.payroll_liquidaciones set review_required=true, review_reason=''Cambió la información de origen. Regenerá la matriz pendiente o revisá la liquidación aprobada.'', review_detected_at=now() where liquidacion_id=v_liq.liquidacion_id;\n    return jsonb_build_object(''ok'',true,''review_required'',true);\n  end if;\n  v_year := p_yyyymm / 100;');
 execute definition;
end $$;
