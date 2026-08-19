-- AuxiliOS · Administración sin motivo manual obligatorio
-- Las acciones siguen auditadas. Cuando una operación cerrada necesita texto para el historial,
-- el backend registra una descripción automática en lugar de exigirla al administrador.

do $migration$
declare
  v_oid oid;
  v_sql text;
  v_before text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='revert_operator_billing_service_v2'
  order by p.oid desc limit 1;
  if v_oid is null then raise exception 'No existe public.revert_operator_billing_service_v2'; end if;
  select pg_get_functiondef(v_oid) into v_sql;

  v_before:=v_sql;
  v_sql:=replace(v_sql,
    'CREATE OR REPLACE FUNCTION public.revert_operator_billing_service_v2(p_service_id uuid, p_reason text)',
    'CREATE OR REPLACE FUNCTION public.revert_operator_billing_service_v2(p_service_id uuid, p_reason text DEFAULT NULL::text)');
  if v_sql=v_before then raise exception 'No se encontró la firma esperada de revert_operator_billing_service_v2'; end if;

  v_before:=v_sql;
  v_sql:=replace(v_sql,
    'v_reason text:=nullif(btrim(coalesce(p_reason,'''')),'''');',
    'v_reason text:=coalesce(nullif(btrim(coalesce(p_reason,'''')),''''),''Acción administrativa'');');
  if v_sql=v_before then raise exception 'No se encontró v_reason esperado en revert_operator_billing_service_v2'; end if;

  v_before:=v_sql;
  v_sql:=replace(v_sql,
    '  if v_reason is null or length(v_reason)<5 then raise exception ''Indicá el motivo de la reversión''; end if;'||chr(10),
    '');
  if v_sql=v_before then raise exception 'No se encontró validación de motivo en revert_operator_billing_service_v2'; end if;

  execute v_sql;
end;
$migration$;

do $migration$
declare
  v_oid oid;
  v_sql text;
  v_before text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='annul_operator_billing_service_v2'
  order by p.oid desc limit 1;
  if v_oid is null then raise exception 'No existe public.annul_operator_billing_service_v2'; end if;
  select pg_get_functiondef(v_oid) into v_sql;

  v_before:=v_sql;
  v_sql:=replace(v_sql,
    'CREATE OR REPLACE FUNCTION public.annul_operator_billing_service_v2(p_service_id uuid, p_reason text)',
    'CREATE OR REPLACE FUNCTION public.annul_operator_billing_service_v2(p_service_id uuid, p_reason text DEFAULT NULL::text)');
  if v_sql=v_before then raise exception 'No se encontró la firma esperada de annul_operator_billing_service_v2'; end if;

  v_before:=v_sql;
  v_sql:=replace(v_sql,
    'v_reason text:=nullif(btrim(coalesce(p_reason,'''')),'''');',
    'v_reason text:=coalesce(nullif(btrim(coalesce(p_reason,'''')),''''),''Acción administrativa'');');
  if v_sql=v_before then raise exception 'No se encontró v_reason esperado en annul_operator_billing_service_v2'; end if;

  v_before:=v_sql;
  v_sql:=replace(v_sql,
    '  if v_reason is null or length(v_reason)<5 then raise exception ''Indicá el motivo de la anulación''; end if;'||chr(10),
    '');
  if v_sql=v_before then raise exception 'No se encontró validación de motivo en annul_operator_billing_service_v2'; end if;

  execute v_sql;
end;
$migration$;

do $migration$
declare
  v_oid oid;
  v_sql text;
  v_before text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='update_operator_billing_service_v2'
  order by p.oid desc limit 1;
  if v_oid is null then raise exception 'No existe public.update_operator_billing_service_v2'; end if;
  select pg_get_functiondef(v_oid) into v_sql;

  v_before:=v_sql;
  v_sql:=replace(v_sql,
    'CREATE OR REPLACE FUNCTION public.update_operator_billing_service_v2(p_service_id uuid, p_payload jsonb, p_reason text)',
    'CREATE OR REPLACE FUNCTION public.update_operator_billing_service_v2(p_service_id uuid, p_payload jsonb, p_reason text DEFAULT NULL::text)');
  if v_sql=v_before then raise exception 'No se encontró la firma esperada de update_operator_billing_service_v2'; end if;

  v_before:=v_sql;
  v_sql:=replace(v_sql,
    'v_reason text:=nullif(btrim(coalesce(p_reason,'''')),'''');',
    'v_reason text:=coalesce(nullif(btrim(coalesce(p_reason,'''')),''''),''Corrección administrativa'');');
  if v_sql=v_before then raise exception 'No se encontró v_reason esperado en update_operator_billing_service_v2'; end if;

  v_before:=v_sql;
  v_sql:=replace(v_sql,
    '  if v_reason is null or length(v_reason)<5 then raise exception ''Indicá el motivo de la corrección''; end if;'||chr(10),
    '');
  if v_sql=v_before then raise exception 'No se encontró validación de motivo en update_operator_billing_service_v2'; end if;

  execute v_sql;
end;
$migration$;

-- En servicios todavía activos, Administración tampoco necesita motivo para una corrección
-- posterior al inicio del viaje. Operador conserva la regla existente.
do $migration$
declare
  v_oid oid;
  v_sql text;
  v_before text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='app_private' and p.proname='update_operator_service_full'
  order by p.oid desc limit 1;
  if v_oid is null then raise exception 'No existe app_private.update_operator_service_full'; end if;
  select pg_get_functiondef(v_oid) into v_sql;

  v_before:=v_sql;
  v_sql:=replace(v_sql,
    'if v_trip_started and v_service.status <> ''at_origin'' and v_structural_changed and v_reason is null then raise exception ''Indicá el motivo de la corrección porque el viaje ya fue iniciado''; end if;',
    'if v_role<>''administracion'' and v_trip_started and v_service.status <> ''at_origin'' and v_structural_changed and v_reason is null then raise exception ''Indicá el motivo de la corrección porque el viaje ya fue iniciado''; end if;');
  if v_sql=v_before then raise exception 'No se encontró la regla de motivo esperada en update_operator_service_full'; end if;

  execute v_sql;
end;
$migration$;

-- El editor canónico deja de mostrar/solicitar motivo para Administración.
create or replace function public.get_operator_service_edit_context(p_service_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $$
declare
  v_role text:=app_private.current_auxilios_role();
  s public.operator_services%rowtype;
  ctx jsonb;
begin
  ctx:=public.get_operator_service_edit_context_base_v2(p_service_id);
  select * into s from public.operator_services where service_id=p_service_id;

  if v_role='administracion' then
    ctx:=jsonb_set(
      ctx,
      '{locks}',
      coalesce(ctx->'locks','{}'::jsonb)||jsonb_build_object('requires_reason',false),
      true
    );

    if s.status='completed' and s.billing_status in ('not_ready','pending','reviewed') then
      ctx:=jsonb_set(
        ctx,
        '{locks}',
        coalesce(ctx->'locks','{}'::jsonb)||jsonb_build_object(
          'closed',false,
          'can_edit',true,
          'requires_reason',false,
          'billing_correction',true
        ),
        true
      );
    end if;
  end if;

  return ctx;
end;
$$;
