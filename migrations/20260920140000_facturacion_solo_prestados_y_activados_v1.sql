-- Facturación cuenta lo que se prestó, más los activados que sí se cobran.
--
-- Dos correcciones que resultaron ser la misma.
--
-- 1) La mesa y el panel tomaban criterios distintos y los dos mal. El panel
--    (`dashboard_facturacion_v1`) contaba TODO servicio no cancelado: un
--    servicio todavía en curso sumaba plata que nadie prestó. Hoy no se nota
--    porque los 4 servicios de la base están finalizados, pero en cuanto el
--    módulo tenga trabajo en curso el total empieza a mentir. Y un $/servicio
--    con servicios no prestados en el denominador es directamente otro número.
--
-- 2) La mesa (`list_operator_billing_services_v3`) exigía `status='completed'`,
--    y por eso un servicio ACTIVADO no llegaba nunca. Pero que el chofer haya
--    ido y el servicio no se haya prestado no significa que no se cobre: la
--    salida existió.
--
-- Queda una sola regla, la misma de los dos lados:
--
--     se prestó (completed)  O  fue un activado que Operaciones/Facturación
--     marcó facturable
--
-- Un activado facturable va a entrar a la mesa con error tarifario mientras
-- "Cancelación" no esté habilitada y con precio para esa prestadora. Es lo
-- correcto: la mesa ya sabe mostrar ese error y bloquear la selección, así que
-- el servicio queda a la vista reclamando la configuración que falta en vez de
-- desaparecer en silencio. No se le inventa un precio.

begin;

-- ── La mesa de Facturación ──────────────────────────────────────────────
do $migration$
declare
  v_oid    oid;
  v_sql    text;
  v_before text;
  v_viejo  text := 's.status=''completed'' and s.billing_status in (''pending'',''reviewed'')';
  v_nuevo  text := '(s.status=''completed'' or (s.driver_activated and s.activation_billing=''facturable'')) and s.billing_status in (''pending'',''reviewed'')';
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'list_operator_billing_services_v3'
  order by p.oid desc limit 1;
  if v_oid is null then
    raise exception 'No existe public.list_operator_billing_services_v3';
  end if;
  select pg_get_functiondef(v_oid) into v_sql;

  -- Aparece tres veces: el filtro de prestadoras, el de períodos y las filas.
  -- Si alguna quedara con el criterio viejo, el desplegable ofrecería
  -- prestadoras que la tabla no muestra.
  if (length(v_sql) - length(replace(v_sql, v_viejo, ''))) / length(v_viejo) <> 3 then
    raise exception 'Se esperaban 3 apariciones del filtro en list_operator_billing_services_v3';
  end if;

  v_before := v_sql;
  v_sql := replace(v_sql, v_viejo, v_nuevo);
  if v_sql = v_before then
    raise exception 'No se pudo reemplazar el filtro en list_operator_billing_services_v3';
  end if;

  execute v_sql;
end;
$migration$;

-- ── El panel ────────────────────────────────────────────────────────────
do $migration$
declare
  v_oid    oid;
  v_sql    text;
  v_before text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'dashboard_facturacion_v1'
  order by p.oid desc limit 1;
  if v_oid is null then
    raise exception 'No existe public.dashboard_facturacion_v1';
  end if;
  select pg_get_functiondef(v_oid) into v_sql;

  v_before := v_sql;
  v_sql := replace(v_sql,
    '      and s.status <> ''cancelled''',
    '      and (s.status = ''completed'' or (s.driver_activated and s.activation_billing = ''facturable''))');
  if v_sql = v_before then
    raise exception 'No se encontró el filtro de estado en dashboard_facturacion_v1';
  end if;

  execute v_sql;
end;
$migration$;

notify pgrst, 'reload schema';

commit;
