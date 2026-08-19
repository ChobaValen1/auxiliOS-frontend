-- AuxiliOS · operator_service_items terrain roles v5
-- The current terrain-aware V4 quote engine emits movement, secondary,
-- distance_asphalt and distance_gravel components. The persistence layer
-- must accept those exact component roles because the unique key includes
-- item_role and asphalt/gravel may coexist for the same concept.

ALTER TABLE public.operator_service_items
  DROP CONSTRAINT IF EXISTS operator_service_items_item_role_check;

ALTER TABLE public.operator_service_items
  ADD CONSTRAINT operator_service_items_item_role_check
  CHECK (item_role IN (
    'primary',
    'secondary',
    'movement',
    'distance',
    'distance_asphalt',
    'distance_gravel'
  ));

COMMENT ON COLUMN public.operator_service_items.item_role IS
  'Rol persistido del componente tarifario: primary, secondary, movement, distance, distance_asphalt o distance_gravel.';
