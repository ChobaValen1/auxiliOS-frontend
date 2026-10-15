-- Operadores pueden corregir servicios finalizados (Historial) mientras no estén facturados · 15/10/2026
do $$
declare d text; n text;
begin
  d:=pg_get_functiondef('public.get_operator_billing_service_edit_context_v1'::regproc);
  n:=replace(d,$a$if auth.uid() is null or v_role<>'administracion' then
    raise exception 'Sólo Administración puede corregir servicios desde Facturación';$a$,
    $a$if auth.uid() is null or coalesce(v_role,'') not in ('administracion','operador') then
    raise exception 'Sólo Administración u Operaciones pueden corregir un servicio finalizado';$a$);
  if n=d then raise exception 'No se pudo parchear get_operator_billing_service_edit_context_v1'; end if;
  execute n;
  d:=pg_get_functiondef('public.update_operator_billing_service_v2'::regproc);
  n:=replace(d,$a$if v_role<>'administracion' or v_uid is null then raise exception 'Sólo Administración puede modificar un servicio FINALIZADO'; end if;$a$,
    $a$if coalesce(v_role,'') not in ('administracion','operador') or v_uid is null then raise exception 'Sólo Administración u Operaciones pueden modificar un servicio FINALIZADO'; end if;$a$);
  if n=d then raise exception 'No se pudo parchear update_operator_billing_service_v2'; end if;
  execute n;
end $$;
