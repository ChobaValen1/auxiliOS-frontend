-- Revierte 20260920150000_cancelacion_cobrable_sola_v1.
--
-- Esa migración activó "Cancelación" y la hizo mixta para que un servicio
-- ACTIVADO pudiera cobrarse con ella. La premisa era falsa.
--
-- Un activado se factura COMPLETO, con la tarifa del servicio que era: un
-- Liviano se cobra como Liviano. La movida ya está pensada para cubrir esa
-- variable. Lo único que se ajusta son los kilómetros, y eso lo hace el
-- operador sobre el servicio.
--
-- Así que "Cancelación" no es el mecanismo, y dejarla activada sólo suma a los
-- listados un concepto que estaba apagado a propósito. Vuelve a como estaba:
-- inactiva y sólo como acompañante.

begin;

update public.service_concepts
   set is_active              = false,
       default_can_be_primary = false
 where name = 'Cancelación';

do $$
declare v_n integer;
begin
  select count(*) into v_n
  from public.service_concepts
  where name = 'Cancelación' and not is_active and service_category = 'secondary';
  if v_n <> 1 then
    raise exception 'No quedó restaurado el estado anterior de "Cancelación" (filas: %)', v_n;
  end if;
end;
$$;

commit;
