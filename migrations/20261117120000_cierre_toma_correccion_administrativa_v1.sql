-- Cierre con corrección administrativa · 17/11/2026
-- Problema (servicio 20261116304638): la corrección administrativa agrupa las pasadas iguales del chofer en una fila
-- «Peaje ×N» (extra_report_ids, migración 20261020180000), pero el cierre (resolve_operator_service_document_v5)
-- exige una decisión por cada pasada informada y no conoce extra_report_ids. La pantalla manda la fila agrupada,
-- la segunda pasada queda «sin revisar» y el cierre corta con «Revisá todos los peajes antes de aprobar».
-- Causa de fondo: la revisión vivía dos veces, guardada en administrative_commercial y rearmada por la pantalla.
--
-- Cambio: si el servicio tiene corrección administrativa, el servidor arma las decisiones desde
-- administrative_commercial y no usa los peajes/excedentes que manda la pantalla. De la pantalla solo se toma
-- administrative_revision, que v5 sigue validando contra el servicio (corrección vieja = error).
--   · Fila con pasadas agrupadas: una decisión por pasada (toll_report_id y cada extra_report_id). Cada extra
--     lleva la cantidad que informó el chofer; la principal lleva el resto, así el total facturado es el de la fila.
--   · Fila agregada por Operaciones (sin pasada): decisión «adjusted» con su review_line_client_id.
--   · Pasada que la corrección sacó: decisión «rejected» con motivo.
-- Sin corrección administrativa, todo sigue igual que antes.

create or replace function app_private.operator_service_review_payload_from_admin_v1(p_service_id uuid)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  s public.operator_services%rowtype;
  a jsonb;
  v_tolls jsonb := '[]';
  v_excesses jsonb := '[]';
  v_covered uuid[] := '{}';
  v_ids uuid[];
  v_main uuid;
  v_extra uuid;
  v_qty integer;
  v_extra_qty integer;
  v_rest integer;
  v_unit numeric;
  v_line jsonb;
  t public.remito_toll_reports%rowtype;
  x public.remito_excess_reports%rowtype;
begin
  select * into s from public.operator_services where service_id = p_service_id for update;
  if not found or s.administrative_commercial is null then return null; end if;

  for a in select value from jsonb_array_elements(coalesce(s.administrative_commercial->'tolls','[]')) loop
    v_qty := greatest(round(coalesce(nullif(a->>'quantity','')::numeric,1))::integer,1);
    v_unit := round(coalesce(nullif(a->>'unit_amount','')::numeric,
                             nullif(a->>'total_amount','')::numeric/v_qty,0),2);
    v_line := jsonb_build_object(
      'decision','accepted',
      'toll_id',a->'toll_id',
      'toll_name',a->>'toll_name',
      'unit_amount',v_unit,
      'payer_agent',a->>'payer_agent',
      'customer_payment_method',a->>'customer_payment_method'
    );
    v_main := nullif(a->>'toll_report_id','')::uuid;

    if v_main is null then
      v_tolls := v_tolls || jsonb_build_array(v_line || jsonb_build_object(
        'decision','adjusted',
        'review_line_client_id',coalesce(nullif(a->>'review_line_client_id','')::uuid,gen_random_uuid()),
        'quantity',v_qty,
        'payment_method',coalesce(nullif(a->>'payment_method',''),'manual')
      ));
      continue;
    end if;

    select coalesce(array_agg(nullif(e#>>'{}','')::uuid),'{}') into v_ids
    from jsonb_array_elements(coalesce(a->'extra_report_ids','[]')) e
    where nullif(e#>>'{}','') is not null;

    v_rest := v_qty;
    foreach v_extra in array v_ids loop
      select * into t from public.remito_toll_reports where toll_report_id = v_extra and remito_id = s.remito_id;
      if not found then raise exception 'Una pasada agrupada no pertenece al remito'; end if;
      v_extra_qty := least(greatest(round(coalesce(t.quantity,1))::integer,1), greatest(v_rest-1,1));
      v_rest := v_rest - v_extra_qty;
      v_tolls := v_tolls || jsonb_build_array(v_line || jsonb_build_object(
        'toll_report_id',v_extra,'quantity',v_extra_qty,'payment_method',coalesce(t.payment_method,'manual')
      ));
      v_covered := v_covered || v_extra;
    end loop;

    select * into t from public.remito_toll_reports where toll_report_id = v_main and remito_id = s.remito_id;
    if not found then raise exception 'Uno de los peajes no pertenece al remito'; end if;
    v_tolls := v_tolls || jsonb_build_array(v_line || jsonb_build_object(
      'toll_report_id',v_main,'quantity',greatest(v_rest,1),'payment_method',coalesce(t.payment_method,'manual')
    ));
    v_covered := v_covered || v_main;
  end loop;

  for t in select * from public.remito_toll_reports where remito_id = s.remito_id and not (toll_report_id = any(v_covered)) loop
    v_tolls := v_tolls || jsonb_build_array(jsonb_build_object(
      'toll_report_id',t.toll_report_id,'decision','rejected','reason','Excluido en la corrección administrativa'
    ));
  end loop;

  v_covered := '{}';
  for a in select value from jsonb_array_elements(coalesce(s.administrative_commercial->'excess_charges','[]')) loop
    v_main := nullif(a->>'excess_report_id','')::uuid;
    v_excesses := v_excesses || jsonb_build_array(jsonb_build_object(
      'excess_report_id',v_main,
      'review_line_client_id',case when v_main is null then coalesce(nullif(a->>'review_line_client_id','')::uuid,gen_random_uuid()) end,
      'decision',case when v_main is null then 'adjusted' else 'accepted' end,
      'concept_id',a->'concept_id',
      'quantity',a->'quantity',
      'unit_amount',a->'unit_amount',
      'payer_agent',coalesce(nullif(a->>'payer_agent',''),'customer'),
      'collector_agent',coalesce(nullif(a->>'collector_agent',''),'company'),
      'customer_payment_method',a->>'customer_payment_method'
    ));
    if v_main is not null then v_covered := v_covered || v_main; end if;
  end loop;

  for x in select * from public.remito_excess_reports where remito_id = s.remito_id and not (excess_report_id = any(v_covered)) loop
    v_excesses := v_excesses || jsonb_build_array(jsonb_build_object(
      'excess_report_id',x.excess_report_id,'decision','rejected','review_reason','Excluido en la corrección administrativa'
    ));
  end loop;

  return jsonb_build_object('tolls',v_tolls,'excesses',v_excesses);
end;
$function$;

revoke all on function app_private.operator_service_review_payload_from_admin_v1(uuid) from public;

-- v6 llama a v5 con el payload armado en el servidor cuando hay corrección administrativa.
-- Reemplazo puntual (falla si no encuentra el texto) y no se repite si ya está aplicado.
do $mig$ declare d text; n int; t text; begin
  d := replace(pg_get_functiondef('public.resolve_operator_service_document_v6(uuid,text,jsonb)'::regprocedure), E'\r', '');
  if position('operator_service_review_payload_from_admin_v1' in d) = 0 then
    t := $a$v_result := public.resolve_operator_service_document_v5(p_service_id,p_action,p_payload);$a$;
    n := (length(d)-length(replace(d,t,'')))/length(t); if n <> 1 then raise exception 'review v6: llamada a v5 no encontrada'; end if;
    d := replace(d, t, $b$-- Con corrección administrativa, las decisiones salen de lo guardado; de la pantalla solo la revisión.
  v_result := public.resolve_operator_service_document_v5(p_service_id,p_action,
    coalesce(
      app_private.operator_service_review_payload_from_admin_v1(p_service_id)
        || jsonb_build_object('administrative_revision',p_payload->'administrative_revision'),
      p_payload));$b$);
    execute d;
  end if;
end $mig$;
