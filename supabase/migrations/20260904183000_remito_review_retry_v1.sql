do $migration$
declare
  v_function regprocedure := to_regprocedure('public.resolve_operator_service_document_v4(uuid,text,jsonb)');
  v_definition text;
  v_updated text;
  v_old_declaration text := 'v_has_review boolean;';
  v_new_declaration text := $replacement$v_has_review boolean;
  v_stale_toll_ids uuid[];
  v_stale_excess_ids uuid[];
  v_stale_review_snapshot jsonb;$replacement$;
  v_old_guard text := $replacement$if v_has_review and s.document_status <> 'approved' then
    raise exception 'La revisión previa quedó inconsistente; volvé a guardar la corrección del remito';
  end if;$replacement$;
  v_new_guard text := $replacement$if v_has_review and s.document_status <> 'approved' then
    if exists(
      select 1
      from public.operator_invoice_services invoice_service
      where invoice_service.service_id = p_service_id
    ) or exists(
      select 1
      from public.operator_invoice_tolls invoice_toll
      join public.operator_service_document_addon_reviews stale_review
        on stale_review.service_toll_id = invoice_toll.service_toll_id
      where stale_review.service_id = p_service_id
        and stale_review.remito_id = r.remito_id
    ) then
      raise exception 'El servicio tiene una revisión ya utilizada por Facturación y no puede reemplazarse';
    end if;

    select
      coalesce(jsonb_agg(to_jsonb(stale_review) order by stale_review.reviewed_at),'[]'::jsonb),
      coalesce(array_agg(stale_review.service_toll_id) filter (where stale_review.service_toll_id is not null),'{}'::uuid[]),
      coalesce(array_agg(stale_review.excess_charge_id) filter (where stale_review.excess_charge_id is not null),'{}'::uuid[])
    into v_stale_review_snapshot,v_stale_toll_ids,v_stale_excess_ids
    from public.operator_service_document_addon_reviews stale_review
    where stale_review.service_id = p_service_id
      and stale_review.remito_id = r.remito_id;

    insert into public.operator_service_events(
      service_id,event_type,from_status,to_status,notes,created_by,details
    ) values (
      p_service_id,'stale_remito_review_replaced',s.status,s.status,
      'Revisión previa reemplazada antes de aprobar y finalizar',v_uid,
      jsonb_build_object(
        'remito_id',r.remito_id,
        'previous_reviews',v_stale_review_snapshot,
        'actor_role',v_role
      )
    );

    delete from public.operator_service_document_addon_reviews
    where service_id = p_service_id and remito_id = r.remito_id;
    delete from public.operator_service_tolls
    where service_toll_id = any(v_stale_toll_ids);
    delete from public.operator_service_excess_charges
    where excess_charge_id = any(v_stale_excess_ids);
    v_has_review := false;
  end if;$replacement$;
begin
  if v_function is null then
    raise exception 'Falta public.resolve_operator_service_document_v4(uuid,text,jsonb)';
  end if;

  select pg_get_functiondef(v_function) into v_definition;
  v_updated := replace(v_definition,v_old_declaration,v_new_declaration);
  if v_updated = v_definition then
    raise exception 'No se encontró la declaración de revisión previa';
  end if;

  v_definition := v_updated;
  v_updated := replace(v_definition,v_old_guard,v_new_guard);
  if v_updated = v_definition then
    raise exception 'No se encontró la protección de revisión previa';
  end if;

  execute v_updated;
end;
$migration$;

revoke all on function public.resolve_operator_service_document_v4(uuid,text,jsonb) from public, anon;
grant execute on function public.resolve_operator_service_document_v4(uuid,text,jsonb) to authenticated;
