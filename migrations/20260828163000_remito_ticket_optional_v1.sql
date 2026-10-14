-- El ticket de peaje y su motivo de ausencia son evidencia opcional.
-- Se conserva la asociación por línea cuando el chofer sí adjunta un ticket.
do $migration$
declare
  v_oid oid := 'app_private.persist_driver_remito_addons_v2(integer,jsonb,uuid)'::regprocedure;
  v_sql text;
  v_old text := $block$
  if exists(
    select 1 from public.remito_toll_reports t
    where t.remito_id=p_remito_id and not exists(
      select 1 from public.remito_evidence e where e.toll_report_id=t.toll_report_id and e.evidence_kind='toll_ticket'
    ) and nullif(btrim(t.missing_evidence_reason),'') is null
  ) then raise exception 'Adjuntá el ticket o justificá por qué no está disponible'; end if;
$block$;
begin
  select pg_get_functiondef(v_oid) into v_sql;

  if position('Adjuntá el ticket o justificá por qué no está disponible' in v_sql) = 0 then
    return;
  end if;

  v_sql := replace(v_sql, v_old, '');
  if position('Adjuntá el ticket o justificá por qué no está disponible' in v_sql) > 0 then
    raise exception 'No se pudo retirar la validación obligatoria de ticket';
  end if;

  execute v_sql;
end;
$migration$;

comment on function app_private.persist_driver_remito_addons_v2(integer,jsonb,uuid)
  is 'Persiste peajes, excedentes y evidencia del chofer; tickets y motivos son opcionales.';
