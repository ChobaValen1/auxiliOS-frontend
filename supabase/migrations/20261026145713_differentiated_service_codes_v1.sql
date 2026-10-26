-- Opt-in endpoints for the preview branch. Existing production endpoints are unchanged.
-- Each operator_service_items row is a billable service of the same assistance.
-- instance_code is supplied by the provider; never derive a suffix or increment it.
create or replace function app_private.quote_prestation_codes_v1(p_service_id uuid,p_quote jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $f$
declare main_code text; row record; code text; own boolean; seen text[]:='{}'; codes jsonb:='{}'; components jsonb; prestations jsonb;
begin
 select nullif(btrim(service_order_number),'') into main_code from public.operator_services where service_id=p_service_id;
 if not found then raise exception 'Asistencia inexistente'; end if;
 for row in select i.* from public.operator_service_items i where i.service_id=p_service_id and i.item_role='secondary' order by i.sort_order,i.item_id loop
  code:=nullif(btrim(row.instance_code),'');
  own:=coalesce((row.snapshot->>'requires_own_code')::boolean,false) or (code is not null and lower(code) is distinct from lower(main_code));
  if own then
   if code is null then raise exception 'La prestación % requiere su número entregado por la Prestadora',row.service_name; end if;
   if lower(code) is not distinct from lower(main_code) then raise exception 'La prestación % necesita un código diferente del principal',row.service_name; end if;
   if lower(code)=any(seen) then raise exception 'El código % está repetido entre las prestaciones de la asistencia',code; end if;
   seen:=array_append(seen,lower(code));
  else code:=coalesce(code,main_code); end if;
  codes:=codes||jsonb_build_object(row.concept_id::text,jsonb_build_object('instance_code',code,'requires_own_code',own,'parent_service_id',p_service_id));
 end loop;
 select coalesce(jsonb_agg(c||case when c->>'role'='secondary' then coalesce(codes->(c->>'concept_id'),jsonb_build_object('instance_code',main_code,'parent_service_id',p_service_id))
 else jsonb_build_object('instance_code',main_code,'parent_service_id',p_service_id) end order by ord),'[]'::jsonb)
 into components from jsonb_array_elements(coalesce(p_quote->'components','[]'::jsonb)) with ordinality as x(c,ord);
 select coalesce(jsonb_agg(c),'[]'::jsonb) into prestations from jsonb_array_elements(components) c where c->>'role'='secondary';
 return coalesce(p_quote,'{}'::jsonb)||jsonb_build_object('components',components,'prestations',prestations,'service_order_number',main_code,'parent_service_id',p_service_id);
end $f$;
revoke all on function app_private.quote_prestation_codes_v1(uuid,jsonb) from public,anon,authenticated;

create or replace function public.get_operator_billing_service_detail_v4(p_service_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $f$
declare d jsonb;
begin
 if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'') not in ('administracion','facturacion','supervision') then raise exception 'Sin permiso para consultar Facturación'; end if;
 d:=public.get_operator_billing_service_detail_v3(p_service_id);
 return d||jsonb_build_object('current_quote',app_private.quote_prestation_codes_v1(p_service_id,d->'current_quote'));
end $f$;
revoke all on function public.get_operator_billing_service_detail_v4(uuid) from public,anon;
grant execute on function public.get_operator_billing_service_detail_v4(uuid) to authenticated;

create or replace function public.get_operator_billing_export_rows_v2(p_service_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path='' as $f$
declare d jsonb; rows jsonb;
begin
 if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'') not in ('administracion','facturacion','supervision') then raise exception 'Sin permiso para exportar Facturación'; end if;
 d:=public.get_operator_billing_export_rows_v1(p_service_ids);
 select coalesce(jsonb_agg(r||jsonb_build_object('quote',app_private.quote_prestation_codes_v1((r->>'service_id')::uuid,r->'quote')) order by ord),'[]'::jsonb)
 into rows from jsonb_array_elements(d->'rows') with ordinality as x(r,ord);
 return d||jsonb_build_object('rows',rows);
end $f$;
revoke all on function public.get_operator_billing_export_rows_v2(uuid[]) from public,anon;
grant execute on function public.get_operator_billing_export_rows_v2(uuid[]) to authenticated;

create or replace function public.create_operator_invoice_v4(p_service_ids uuid[],p_service_toll_ids uuid[],p_document_type text,p_point_of_sale text,p_document_number text,p_issued_on date,p_notes text default null)
returns jsonb language plpgsql security definer set search_path='' as $f$
declare result jsonb; service_id uuid; line record; q jsonb;
begin
 if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'') not in ('administracion','facturacion') then raise exception 'Sin permiso para facturar'; end if;
 -- Validate and lock before creating anything. The existing invoice procedure
 -- keeps its own validation, locks, duplicate prevention, totals and audit.
 for service_id in select s.service_id from public.operator_services s where s.service_id=any(p_service_ids) order by s.service_id for update loop
  perform app_private.quote_prestation_codes_v1(service_id,'{}'::jsonb);
 end loop;
 result:=public.create_operator_invoice_v3(p_service_ids,p_service_toll_ids,p_document_type,p_point_of_sale,p_document_number,p_issued_on,p_notes);
 -- Freeze codes on newly created lines in this transaction, never on old invoices.
 for line in select l.* from public.operator_invoice_services l where l.invoice_id=(result->>'invoice_id')::uuid for update loop
  q:=app_private.quote_prestation_codes_v1(line.service_id,line.quote_snapshot);
  update public.operator_invoice_services set quote_snapshot=q,
   service_snapshot=service_snapshot||jsonb_build_object('prestations',q->'prestations') where invoice_service_id=line.invoice_service_id;
 end loop;
 return result;
end $f$;
revoke all on function public.create_operator_invoice_v4(uuid[],uuid[],text,text,text,date,text) from public,anon;
grant execute on function public.create_operator_invoice_v4(uuid[],uuid[],text,text,text,date,text) to authenticated;
