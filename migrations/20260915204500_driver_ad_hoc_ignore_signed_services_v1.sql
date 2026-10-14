-- Permite un nuevo ingreso del Chofer cuando el único servicio operativo activo
-- ya tiene su remito firmado. El estado at_origin se conserva hasta el cierre
-- administrativo, pero no representa un remito pendiente de completar.
do $migration$
declare
  v_signature regprocedure := to_regprocedure('public.save_driver_ad_hoc_remito_v1(jsonb,uuid)');
  v_definition text;
  v_previous text := $needle$where s.assigned_driver_id=v_uid and s.status in ('assigned','at_origin')$needle$;
  v_replacement text := $needle$where s.assigned_driver_id=v_uid and s.status in ('assigned','at_origin')
        and not exists(
          select 1
          from public.remitos active_remito
          where active_remito.operator_service_id=s.service_id
            and active_remito.status='firmado'
        )$needle$;
begin
  if v_signature is null then
    raise exception 'Falta public.save_driver_ad_hoc_remito_v1(jsonb,uuid)';
  end if;

  select pg_get_functiondef(v_signature) into v_definition;
  if position(v_previous in v_definition)=0 then
    raise exception 'No se encontró la validación de servicios activos esperada';
  end if;

  execute replace(v_definition,v_previous,v_replacement);
end;
$migration$;

comment on function public.save_driver_ad_hoc_remito_v1(jsonb,uuid) is
  'Guarda remitos iniciados por Chofer sin asignación; bloquea sólo servicios activos cuyo remito todavía no fue firmado.';
