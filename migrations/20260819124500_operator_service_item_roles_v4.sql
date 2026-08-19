-- AuxiliOS · Servicios · roles de ítems compatibles con Tarifario v4
-- El tarifario v4 persiste componentes de movida y distancia en el snapshot del servicio.
-- Se mantienen primary/secondary y se habilitan los roles comerciales movement/distance.

ALTER TABLE public.operator_service_items
  DROP CONSTRAINT IF EXISTS operator_service_items_item_role_check;

ALTER TABLE public.operator_service_items
  ADD CONSTRAINT operator_service_items_item_role_check
  CHECK (item_role IN ('primary','secondary','movement','distance'));

COMMENT ON COLUMN public.operator_service_items.item_role IS
  'Rol estructural/comercial del ítem: primary, secondary, movement o distance.';
