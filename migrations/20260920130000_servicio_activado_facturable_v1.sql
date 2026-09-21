-- ACTIVADO deja de ser una etiqueta y pasa a ser un hecho, con su decisión de
-- cobro aparte.
--
-- Cuando el chofer llega y el servicio no se presta —el socio ya se fue, el
-- vehículo arrancó solo, la prestadora lo canceló—, marca ACTIVADO. Hoy eso
-- termina en `status='cancelled'` + `billing_status='not_ready'`, o sea dos
-- puertas cerradas hacia Facturación. Pero que no se haya prestado el servicio
-- NO significa que no se cobre: el chofer fue igual, y el tarifario ya tiene el
-- concepto "Cancelación" justamente para eso.
--
-- Peor todavía: "ACTIVADO" no se guardaba en ningún lado. La RPC lo devolvía
-- como `business_status` en el JSON de respuesta, y la pantalla de Operaciones
-- los encontraba con `cancellation_reason ilike 'ACTIVADO%'` — un prefijo de
-- texto libre. Cambiando esa redacción, la pestaña "Activados por chofer" se
-- vaciaba en silencio y nadie se enteraba.
--
-- Esta migración:
--   1. Guarda el hecho: `driver_activated`.
--   2. Guarda la decisión de cobro aparte, que el chofer NO toma:
--      `activation_billing` en sin_definir / facturable / no_facturable.
--   3. Deja que la resuelvan Operaciones Y Facturación, no sólo Facturación.
--   4. Cambia el filtro del listado de texto libre a la columna.
--
-- Hay 0 servicios cancelados en la base, así que no hace falta backfill.
--
-- Lo que esta migración NO hace: ponerle precio. Cobrar un activado necesita
-- que "Cancelación" esté habilitada como servicio principal para esa
-- prestadora y con su precio cargado; hoy los dos tarifarios reales la tienen
-- en $0,00 y el tarifador rechaza cotizarla. Eso es configuración comercial y
-- la carga Administración, no una migración.

begin;

-- ── 1 y 2. El hecho y la decisión ───────────────────────────────────────
alter table public.operator_services
  add column if not exists driver_activated      boolean not null default false,
  add column if not exists activation_billing    text    not null default 'sin_definir',
  add column if not exists activation_decided_by uuid,
  add column if not exists activation_decided_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'operator_services_activation_billing_check'
  ) then
    alter table public.operator_services
      add constraint operator_services_activation_billing_check
      check (activation_billing = any (array['sin_definir','facturable','no_facturable']));
  end if;
end;
$$;

comment on column public.operator_services.driver_activated is
  'El chofer llegó y el servicio no se prestó. Es un hecho operativo, no una decisión de cobro: un activado puede facturarse igual (concepto "Cancelación"). Antes esto se deducía de un ilike sobre cancellation_reason.';
comment on column public.operator_services.activation_billing is
  'Si un servicio ACTIVADO se cobra. La decide Operaciones o Facturación, nunca el chofer. sin_definir mientras nadie la tomó.';

-- Los activados sin decidir son una cola de trabajo: que se encuentren rápido.
create index if not exists operator_services_activacion_pendiente_idx
  on public.operator_services (activation_billing, scheduled_for desc)
  where driver_activated;

-- ── 3. La RPC de activación guarda el hecho ─────────────────────────────
-- Se parchea la definición viva en vez de reescribirla entera: el resto de la
-- función (permisos del chofer, anulación del borrador, validaciones) no
-- cambia, y copiarla acá la dejaría divergir del original en silencio.
do $migration$
declare
  v_oid    oid;
  v_sql    text;
  v_before text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'mark_driver_operator_service_activated_v2'
  order by p.oid desc limit 1;
  if v_oid is null then
    raise exception 'No existe public.mark_driver_operator_service_activated_v2';
  end if;
  select pg_get_functiondef(v_oid) into v_sql;

  v_before := v_sql;
  v_sql := replace(v_sql,
    '      cancellation_reason = ''ACTIVADO · '' || v_reason_label,',
    '      cancellation_reason = ''ACTIVADO · '' || v_reason_label,'
      || chr(10) || '      driver_activated = true,'
      || chr(10) || '      activation_billing = ''sin_definir'','
      || chr(10) || '      activation_decided_by = null,'
      || chr(10) || '      activation_decided_at = null,');
  if v_sql = v_before then
    raise exception 'No se encontró la asignación de cancellation_reason en mark_driver_operator_service_activated_v2';
  end if;

  execute v_sql;
end;
$migration$;

-- ── 4. El listado filtra por la columna, no por el texto ────────────────
do $migration$
declare
  v_oid    oid;
  v_sql    text;
  v_before text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'list_driver_activated_services_v1'
  order by p.oid desc limit 1;
  if v_oid is null then
    raise exception 'No existe public.list_driver_activated_services_v1';
  end if;
  select pg_get_functiondef(v_oid) into v_sql;

  v_before := v_sql;
  v_sql := replace(v_sql,
    'where s.status=''cancelled'' and s.cancellation_reason ilike ''ACTIVADO%''',
    'where s.status=''cancelled'' and s.driver_activated');
  if v_sql = v_before then
    raise exception 'No se encontró el filtro por texto en list_driver_activated_services_v1';
  end if;

  execute v_sql;
end;
$migration$;

-- ── 5. La decisión ──────────────────────────────────────────────────────
create or replace function public.decide_activated_service_billing_v1(
  p_service_id uuid,
  p_billable   boolean,
  p_reason     text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_uid    uuid := auth.uid();
  v_role   text := app_private.current_auxilios_role();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_row    public.operator_services;
begin
  -- Operaciones también, no sólo Facturación: el operador es quien habló con
  -- la prestadora y sabe si esa salida se cobra.
  if v_uid is null or coalesce(v_role, '') not in ('administracion', 'operador', 'facturacion') then
    raise exception 'Sin permiso para decidir si un servicio ACTIVADO se factura';
  end if;

  if p_billable is null then
    raise exception 'Indicá si el servicio activado se factura o no';
  end if;

  select * into v_row
  from public.operator_services
  where service_id = p_service_id
  for update;

  if not found then
    raise exception 'Servicio inexistente';
  end if;

  if not v_row.driver_activated then
    raise exception 'Este servicio no fue marcado como ACTIVADO por el Chofer';
  end if;

  if v_row.billing_status = 'invoiced' then
    raise exception 'El servicio ya fue facturado: no se puede cambiar la decisión';
  end if;

  update public.operator_services
     set activation_billing    = case when p_billable then 'facturable' else 'no_facturable' end,
         activation_decided_by = v_uid,
         activation_decided_at = now(),
         -- 'pending' lo pone en la mesa de Facturación; 'excluded' lo cierra
         -- sin sacarlo del historial.
         billing_status        = case when p_billable then 'pending' else 'excluded' end,
         cancellation_reason_detail = coalesce(v_reason, cancellation_reason_detail)
   where service_id = p_service_id
  returning * into v_row;

  return jsonb_build_object(
    'service_id',         v_row.service_id,
    'driver_activated',   v_row.driver_activated,
    'activation_billing', v_row.activation_billing,
    'billing_status',     v_row.billing_status
  );
end;
$function$;

comment on function public.decide_activated_service_billing_v1(uuid, boolean, text) is
  'Decide si un servicio marcado ACTIVADO por el chofer se factura. La toman Operaciones o Facturación —nunca el chofer, que informa el hecho y no el cobro—. Facturable lo manda a la mesa (billing_status pending); no facturable lo cierra como excluded, sin sacarlo del historial.';

revoke all on function public.decide_activated_service_billing_v1(uuid, boolean, text) from public, anon;
grant execute on function public.decide_activated_service_billing_v1(uuid, boolean, text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
