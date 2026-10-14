-- ACTIVADO deja de cerrar el servicio.
--
-- Un activado se factura COMPLETO, con la tarifa del servicio que era: un
-- Liviano se cobra como Liviano. La movida ya cubre esa variable. Lo único que
-- se ajusta son los kilómetros, y eso lo hace el operador.
--
-- Pero el ACTIVADO del chofer cerraba el servicio en el acto —lo dejaba
-- 'cancelled', liberaba chofer y móvil y ponía billing_status 'not_ready'—, así
-- que el operador nunca llegaba a ajustar nada: cuando quería entrar, ya estaba
-- cerrado, y la corrección administrativa sólo acepta servicios finalizados.
--
-- Ahora el activado queda **arribado**, que es literalmente lo que pasó: el
-- chofer llegó y el servicio no se prestó. Con eso el operador recupera todo lo
-- que ya sabía hacer sobre un servicio abierto —ajustar los km desde Servicios
-- y finalizarlo con la excepción sin remito— sin permisos nuevos. Finalizado,
-- entra a Facturación por el camino de siempre.
--
-- La jerarquía queda respetada: el chofer informa el hecho, el operador pone el
-- número, Administración corrige después desde Facturación.
--
-- **Un motivo no es un activado.** De los cuatro, tres son "fui y no se
-- prestó": socio ausente, la prestadora lo dio de baja, otro. El cuarto —"lo
-- dimos de baja nosotros"— es lo contrario: no hubo salida que cobrar. Ese
-- sigue cerrando el servicio como antes. No se saca de la pantalla del chofer
-- porque no tiene otro lado dónde reportarlo, pero va por el camino de
-- anulación y no por el de cobro.
--
-- El trigger app_private.operator_services_before_update exige la transición
-- 'manual_arrival' para pasar de 'assigned' a 'at_origin', y él mismo completa
-- arrived_at / arrived_by.
--
-- Con esto sobra la decisión "¿se factura o no?" que introdujo
-- 20260920130000: activado ya significa que se cobra. Se borra la RPC y las
-- columnas de esa decisión. Queda `driver_activated`, que es el hecho y vale
-- con cualquier modelo.

begin;

-- ── 1. La activación no cierra el servicio ──────────────────────────────
create or replace function public.mark_driver_operator_service_activated_v3(
  p_service_id   uuid,
  p_reason_code  text,
  p_reason_detail text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid          uuid := auth.uid();
  v_role         text := app_private.current_auxilios_role();
  s              public.operator_services%rowtype;
  r              public.remitos%rowtype;
  v_reason_code  text := btrim(coalesce(p_reason_code, ''));
  v_reason_label text;
  v_draft_voided boolean := false;
  v_hubo_salida  boolean;
begin
  if v_uid is null or v_role <> 'chofer' then
    raise exception 'Solo el Chofer asignado puede marcar un servicio como ACTIVADO';
  end if;

  if v_reason_code not in ('absent_or_not_towable','provider','us','other') then
    raise exception 'Seleccioná un motivo de la activación válido';
  end if;

  -- Fue y no se prestó: la salida existió y se cobra. 'us' es lo contrario.
  v_hubo_salida := v_reason_code in ('absent_or_not_towable','provider','other');

  v_reason_label := case v_reason_code
    when 'absent_or_not_towable' then 'Socio ausente / vehículo no apto'
    when 'provider'              then 'La Prestadora lo dio de baja'
    when 'us'                    then 'Lo dimos de baja nosotros'
    else 'Otro'
  end;

  select * into s
  from public.operator_services
  where service_id = p_service_id
  for update;

  if not found then
    raise exception 'Servicio inexistente';
  end if;
  if s.assigned_driver_id is distinct from v_uid then
    raise exception 'El servicio no está asignado a este Chofer';
  end if;
  if s.status <> 'assigned' then
    raise exception 'Solo un servicio ASIGNADO puede marcarse como ACTIVADO';
  end if;

  perform set_config('app.phase3_bridge', '1', true);

  -- El borrador se anula en los dos caminos: no se prestó el servicio, así que
  -- no hay remito que firmar.
  if s.remito_id is not null then
    select * into r
    from public.remitos
    where remito_id = s.remito_id
      and operator_service_id = s.service_id
    for update;

    if not found then
      raise exception 'El remito vinculado al servicio no es válido';
    end if;
    if r.status <> 'pendiente' or r.firma_imagen_url is not null or r.firmado_at is not null then
      raise exception 'El servicio tiene un remito finalizado y no puede marcarse como ACTIVADO';
    end if;

    update public.remitos
    set status        = 'anulado',
        sync_status   = 'synced',
        received_at   = now(),
        observaciones = concat_ws(E'\n', nullif(observaciones,''),
                                  'Borrador anulado al marcar el servicio como ACTIVADO.')
    where remito_id = r.remito_id;
    v_draft_voided := true;
  end if;

  if v_hubo_salida then
    -- Queda arribado y con su chofer y su móvil: el viaje existió y esos
    -- kilómetros son de ellos. El operador lo ajusta y lo finaliza.
    perform set_config('app.lifecycle_transition', 'manual_arrival', true);

    update public.operator_services
    set status                   = 'at_origin',
        document_status          = case when v_draft_voided then 'not_started' else document_status end,
        cancellation_reason_code = v_reason_code,
        cancellation_reason_detail = nullif(btrim(coalesce(p_reason_detail,'')),''),
        cancellation_reason      = 'ACTIVADO · ' || v_reason_label,
        driver_activated         = true,
        updated_by               = v_uid
    where service_id = p_service_id
    returning * into s;
  else
    -- No hubo salida: se cierra y libera, igual que antes.
    if s.trip_id is not null then
      update public.trips
      set fecha_hora_fin = coalesce(fecha_hora_fin, now()),
          received_at    = now(),
          sync_status    = 'synced'
      where trip_id = s.trip_id;
    end if;

    perform set_config('app.lifecycle_transition', 'annul', true);
    perform set_config('app.assignment_reason', v_reason_code, true);
    perform set_config('app.assignment_notes', 'ACTIVADO · ' || v_reason_label, true);

    update public.operator_services
    set status                   = 'cancelled',
        cancelled_at             = now(),
        document_status          = case when v_draft_voided then 'not_started' else document_status end,
        billing_status           = 'not_ready',
        cancellation_reason_code = v_reason_code,
        cancellation_reason_detail = nullif(btrim(coalesce(p_reason_detail,'')),''),
        cancellation_reason      = 'ACTIVADO · ' || v_reason_label,
        driver_activated         = true,
        assigned_driver_id       = null,
        assigned_truck_id        = null,
        updated_by               = v_uid
    where service_id = p_service_id
    returning * into s;
  end if;

  return jsonb_build_object(
    'service_id',               s.service_id,
    'service_order_number',     s.service_order_number,
    'status',                   s.status,
    'business_status',          'activated',
    'se_factura',               v_hubo_salida,
    'billing_status',           s.billing_status,
    'cancelled_at',             s.cancelled_at,
    'cancellation_reason_code', s.cancellation_reason_code,
    'cancellation_reason',      s.cancellation_reason,
    'draft_remito_voided',      v_draft_voided
  );
end;
$function$;

comment on function public.mark_driver_operator_service_activated_v3(uuid, text, text) is
  'El chofer informa que llegó y el servicio no se prestó. Cuando hubo salida (socio ausente, la prestadora lo dio de baja, otro) el servicio queda ARRIBADO, con su chofer y su móvil, para que el operador ajuste los kilómetros y lo finalice: se factura completo, a la tarifa del servicio que era. Cuando lo dimos de baja nosotros no hubo salida que cobrar y el servicio se cierra y libera, como antes.';

revoke all on function public.mark_driver_operator_service_activated_v3(uuid, text, text) from public, anon;
grant execute on function public.mark_driver_operator_service_activated_v3(uuid, text, text) to authenticated, service_role;

-- ── 2. El listado ya no puede exigir 'cancelled' ────────────────────────
do $migration$
declare
  v_oid oid; v_sql text; v_before text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'list_driver_activated_services_v1'
  order by p.oid desc limit 1;
  if v_oid is null then raise exception 'No existe public.list_driver_activated_services_v1'; end if;
  select pg_get_functiondef(v_oid) into v_sql;

  v_before := v_sql;
  v_sql := replace(v_sql,
    'where s.status=''cancelled'' and s.driver_activated',
    'where s.driver_activated');
  if v_sql = v_before then
    raise exception 'No se encontró el filtro por status en list_driver_activated_services_v1';
  end if;

  execute v_sql;
end;
$migration$;

-- ── 3. Facturación vuelve a la regla simple ─────────────────────────────
-- Un activado finalizado es 'completed' como cualquier otro, así que la
-- excepción que 20260920140000 le agregó al filtro ya no hace falta.
do $migration$
declare
  v_oid oid; v_sql text; v_before text;
  v_con    text := '(s.status=''completed'' or (s.driver_activated and s.activation_billing=''facturable'')) and s.billing_status in (''pending'',''reviewed'')';
  v_simple text := 's.status=''completed'' and s.billing_status in (''pending'',''reviewed'')';
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'list_operator_billing_services_v3'
  order by p.oid desc limit 1;
  select pg_get_functiondef(v_oid) into v_sql;

  if (length(v_sql) - length(replace(v_sql, v_con, ''))) / length(v_con) <> 3 then
    raise exception 'Se esperaban 3 apariciones del filtro en list_operator_billing_services_v3';
  end if;
  v_before := v_sql;
  v_sql := replace(v_sql, v_con, v_simple);
  if v_sql = v_before then raise exception 'No se pudo simplificar el filtro de la mesa'; end if;
  execute v_sql;
end;
$migration$;

do $migration$
declare
  v_oid oid; v_sql text; v_before text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'dashboard_facturacion_v1'
  order by p.oid desc limit 1;
  select pg_get_functiondef(v_oid) into v_sql;

  v_before := v_sql;
  v_sql := replace(v_sql,
    '      and (s.status = ''completed'' or (s.driver_activated and s.activation_billing = ''facturable''))',
    '      and s.status = ''completed''');
  if v_sql = v_before then raise exception 'No se pudo simplificar el filtro del panel'; end if;
  execute v_sql;
end;
$migration$;

-- ── 4. Fuera la decisión de cobro: activado ya significa que se cobra ───
drop function if exists public.decide_activated_service_billing_v1(uuid, boolean, text);

drop index if exists public.operator_services_activacion_pendiente_idx;

alter table public.operator_services
  drop constraint if exists operator_services_activation_billing_check;

alter table public.operator_services
  drop column if exists activation_billing,
  drop column if exists activation_decided_by,
  drop column if exists activation_decided_at;

notify pgrst, 'reload schema';

commit;
