-- Configuración → Servicios no se podía guardar (400 "violates check constraint").
--
-- La pantalla pasó a tener las columnas nuevas de Servicios (code, datetime,
-- provider, driver, amount_due, …: 17 claves) y ya no manda
-- purchase_order_number en field_modes, pero las restricciones de la tabla
-- seguían exigiendo exactamente las 11 columnas viejas y todas las claves
-- viejas de field_modes. Cualquier guardado fallaba, incluido pasar
-- "Teléfono del cliente" a Obligatorio.
--
-- · column_order: array (1–40) con 'actions', solo claves conocidas (nuevas y
--   viejas, para no invalidar la fila guardada).
-- · field_modes: objeto cuyas claves presentes valen required/optional/hidden.

alter table public.service_module_settings drop constraint if exists service_module_settings_column_order_check;
alter table public.service_module_settings add constraint service_module_settings_column_order_check check (
  jsonb_typeof(column_order) = 'array' and jsonb_array_length(column_order) between 1 and 40 and column_order ? 'actions'
  and column_order <@ '["code","datetime","arrival","finish","provider","base","type","origin","destination","client","km","driver","delay","mobile","status","amount_due","actions","service","date","route","customer_vehicle","resource","priority","updated"]'::jsonb);

alter table public.service_module_settings drop constraint if exists service_module_settings_field_modes_check;
alter table public.service_module_settings add constraint service_module_settings_field_modes_check check (
  jsonb_typeof(field_modes) = 'object'
  and not jsonb_path_exists(field_modes, '$.* ? (@ != "required" && @ != "optional" && @ != "hidden")'));
