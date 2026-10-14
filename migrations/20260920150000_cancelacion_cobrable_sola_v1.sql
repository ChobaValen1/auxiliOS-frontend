-- "Cancelación" pasa a poder cobrarse sola.
--
-- Un servicio que el chofer marcó ACTIVADO —fue y el servicio no se prestó— se
-- cobra con el concepto "Cancelación". El concepto ya existe y ya está
-- habilitado en tres prestadoras, pero el tarifador lo rechazaba igual.
--
-- El validador de app_private.calculate_operator_service_quote_v4_full pide
-- cuatro cosas del concepto que va como principal:
--
--     sc.is_active
--     AND sc.billing_family <> 'system'
--     AND sc.service_category IN ('primary','mixed')
--     AND css.is_enabled            -- habilitado para esa prestadora
--
-- "Cancelación" fallaba dos: estaba inactivo y quedaba clasificado como
-- 'secondary', o sea que sólo podía ir de acompañante de otro servicio. Y un
-- activado no tiene servicio que lo acompañe: por definición no se prestó
-- ninguno. Por eso cotizarlo devolvía "El Tipo de Servicio principal no está
-- habilitado para la prestadora", que es un mensaje engañoso — habilitado
-- estaba; lo que no podía era ir solo.
--
-- `service_category` NO se escribe: es una columna generada.
--
--     CASE WHEN billing_family = 'system'                      THEN 'system'
--          WHEN default_can_be_primary AND default_can_be_secondary THEN 'mixed'
--          WHEN default_can_be_primary                         THEN 'primary'
--          ELSE 'secondary' END
--
-- Así que lo que se toca es `default_can_be_primary`, y la categoría se
-- recalcula sola a 'mixed'. Mixto y no primario porque "Cancelación" tiene que
-- seguir sirviendo de acompañante donde ya se usa —una cancelación cargada
-- sobre un servicio que sí se prestó— Y además poder ir sola.
--
-- El segundo filtro del tarifador, el que busca la tarifa en
-- company_rate_items, no mira `can_be_primary`: con el concepto alcanza, los
-- ítems de tarifa ya existen y están activos.
--
-- Lo que esta migración NO hace: ponerle precio. Los valores por prestadora se
-- cargan desde Configuración → Tarifas, y hoy están en $0,00. Sin precio, el
-- activado aparece en la mesa de Facturación con el error tarifario a la
-- vista, que es lo correcto: reclama la configuración que falta en vez de
-- facturar cero en silencio.
--
-- Efecto visible: al activarse, "Cancelación" vuelve a aparecer en los
-- catálogos de tipo de servicio, y al ser mixta puede elegirse como servicio
-- principal al cargar un servicio a mano.

begin;

update public.service_concepts
   set is_active              = true,
       default_can_be_primary = true
 where name = 'Cancelación';

-- Si no quedó exactamente un concepto activo y mixto, algo cambió respecto de
-- lo que se analizó y es mejor abortar que dejar el catálogo a medias.
do $$
declare v_n integer;
begin
  select count(*) into v_n
  from public.service_concepts
  where name = 'Cancelación' and is_active and service_category = 'mixed';
  if v_n <> 1 then
    raise exception 'Se esperaba exactamente un concepto "Cancelación" activo y mixto, hay %', v_n;
  end if;
end;
$$;

commit;
