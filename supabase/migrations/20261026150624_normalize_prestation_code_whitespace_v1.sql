-- Normalize pasted whitespace without changing stored codes or invoices.
create or replace function app_private.quote_prestation_codes_v1(p_service_id uuid,p_quote jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $f$
declare main_code text; row record; code text; own boolean; seen text[]:='{}'; codes jsonb:='{}'; components jsonb; prestations jsonb;
begin
 select nullif(btrim(service_order_number, E' \t\n\r'),'') into main_code from public.operator_services where service_id=p_service_id;
 if not found then raise exception 'Asistencia inexistente'; end if;
 for row in select i.* from public.operator_service_items i where i.service_id=p_service_id and i.item_role='secondary' order by i.sort_order,i.item_id loop
  code:=nullif(btrim(row.instance_code, E' \t\n\r'),'');
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
