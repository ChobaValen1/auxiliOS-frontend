-- Base del dashboard rediseñado: zona geográfica normalizada en los servicios.
--
-- El maps-proxy ya extrae administrative_area_level_1 (provincia) y locality de
-- cada dirección, pero en operator_services eso se perdía: sólo quedaban lat/lng
-- y el formatted_address. operator-billing-export.js lo venía parseando del texto
-- en cada exportación, que se rompe con direcciones de formato inusual.
--
-- Estas columnas guardan lo que Google ya resolvió, para que el dashboard agrupe
-- por zona sin parsear strings ni volver a llamar a Google.
--
-- No hay backfill: operator_services está vacía (el módulo arranca el 1/10).

begin;

alter table public.operator_services
  add column if not exists origin_province        text,
  add column if not exists origin_locality        text,
  add column if not exists destination_province   text,
  add column if not exists destination_locality   text;

comment on column public.operator_services.origin_province is
  'administrative_area_level_1 del origen, resuelto por maps-proxy al guardar el servicio.';
comment on column public.operator_services.destination_province is
  'administrative_area_level_1 del destino, resuelto por maps-proxy al guardar el servicio.';

-- El dashboard filtra por rango de fecha y agrupa por zona.
create index if not exists operator_services_origin_province_idx
  on public.operator_services (origin_province, scheduled_for desc)
  where origin_province is not null;

-- El heatmap sólo mira servicios con coordenadas; el índice parcial evita
-- recorrer los que no las tienen.
create index if not exists operator_services_origin_coords_idx
  on public.operator_services (scheduled_for desc)
  where origin_lat is not null and origin_lng is not null;

-- Fallback para servicios cuya provincia no vino resuelta por el proxy: la saca
-- del formatted_address de Google ("Calle 123, Localidad, Provincia, Argentina").
-- Sacado el sufijo ", Argentina", la provincia es el ÚLTIMO componente; Google
-- antepone el código postal en algunas ("C1043AAZ Cdad. Autónoma de Buenos
-- Aires"), así que se le quita el CPA del principio.
-- Es un fallback: el camino normal es el campo province que ya devuelve maps-proxy,
-- que viene consistente. Este parseo puede dar "Buenos Aires" y "Provincia de
-- Buenos Aires" como dos valores distintos.
-- immutable porque sólo depende del texto de entrada.
create or replace function app_private.provincia_desde_direccion(p_direccion text)
returns text
language sql
immutable
set search_path=''
as $function$
  select nullif(
    btrim(regexp_replace(partes[array_length(partes, 1)],
                         '^\s*[A-Za-z]?\d{4}[A-Za-z]{0,3}\s+', '')),
    '')
  from (
    select string_to_array(
      regexp_replace(coalesce(p_direccion, ''), ',\s*Argentina\s*$', '', 'i'),
      ','
    ) as partes
  ) q
  where array_length(partes, 1) >= 2;
$function$;

revoke all on function app_private.provincia_desde_direccion(text) from public, anon;
grant execute on function app_private.provincia_desde_direccion(text) to authenticated, service_role;

commit;
