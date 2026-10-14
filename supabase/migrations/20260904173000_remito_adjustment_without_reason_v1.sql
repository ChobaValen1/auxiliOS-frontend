do $migration$
declare
  v_function regprocedure := to_regprocedure('public.resolve_operator_service_document_v4(uuid,text,jsonb)');
  v_definition text;
  v_updated text;
begin
  if v_function is null then
    raise exception 'Falta public.resolve_operator_service_document_v4(uuid,text,jsonb)';
  end if;

  select pg_get_functiondef(v_function) into v_definition;
  v_updated := replace(
    v_definition,
    'if v_reason is null then raise exception ''Explicá el ajuste realizado al peaje''; end if;',
    ''
  );
  if v_updated = v_definition then
    raise exception 'No se encontró la validación de motivo del ajuste de peaje';
  end if;

  v_definition := v_updated;
  v_updated := replace(
    v_definition,
    'if v_reason is null then raise exception ''Explicá el ajuste realizado al excedente''; end if;',
    ''
  );
  if v_updated = v_definition then
    raise exception 'No se encontró la validación de motivo del ajuste de excedente';
  end if;

  execute v_updated;
end;
$migration$;

revoke all on function public.resolve_operator_service_document_v4(uuid,text,jsonb) from public, anon;
grant execute on function public.resolve_operator_service_document_v4(uuid,text,jsonb) to authenticated;
