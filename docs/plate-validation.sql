CREATE OR REPLACE FUNCTION app_private.normalize_vehicle_plate_v1(p_plate text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE v text := upper(regexp_replace(coalesce(p_plate,''),'[[:space:]-]','','g'));
BEGIN
 IF v = '' THEN RETURN null; END IF;
 IF v !~ '^([A-Z]{3}[0-9]{3}|[A-Z]{2}[0-9]{3}[A-Z]{2}|[0-9]{3}[A-Z]{3}|[A-Z][0-9]{3}[A-Z]{3})$' THEN
  RAISE EXCEPTION 'Patente inválida. Usá ABC123 o AB123CD; para motos, 123ABC o A123BCD (máximo 7 caracteres).' USING ERRCODE='22023';
 END IF;
 RETURN v;
END $$;
REVOKE ALL ON FUNCTION app_private.normalize_vehicle_plate_v1(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.normalize_vehicle_plate_v1(text) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION app_private.validate_vehicle_plate_row_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF TG_ARGV[0]='vehicle_plate' THEN
  IF TG_OP='UPDATE' THEN
   IF NEW.vehicle_plate IS NOT DISTINCT FROM OLD.vehicle_plate THEN RETURN NEW; END IF;
  END IF;
  NEW.vehicle_plate:=app_private.normalize_vehicle_plate_v1(NEW.vehicle_plate);
 ELSE
  IF TG_OP='UPDATE' THEN
   IF NEW.patente IS NOT DISTINCT FROM OLD.patente THEN RETURN NEW; END IF;
  END IF;
  NEW.patente:=app_private.normalize_vehicle_plate_v1(NEW.patente);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app_private.validate_vehicle_plate_row_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.validate_vehicle_plate_row_v1() TO authenticated, service_role;
CREATE TRIGGER validate_vehicle_plate_v1 BEFORE INSERT OR UPDATE OF vehicle_plate ON public.operator_services FOR EACH ROW EXECUTE FUNCTION app_private.validate_vehicle_plate_row_v1('vehicle_plate');
CREATE TRIGGER validate_vehicle_plate_v1 BEFORE INSERT OR UPDATE OF vehicle_plate ON public.driver_service_intakes FOR EACH ROW EXECUTE FUNCTION app_private.validate_vehicle_plate_row_v1('vehicle_plate');
CREATE TRIGGER validate_vehicle_plate_v1 BEFORE INSERT OR UPDATE OF patente ON public.trips FOR EACH ROW EXECUTE FUNCTION app_private.validate_vehicle_plate_row_v1('patente');
CREATE TRIGGER validate_vehicle_plate_v1 BEFORE INSERT OR UPDATE OF patente ON public.remitos FOR EACH ROW EXECUTE FUNCTION app_private.validate_vehicle_plate_row_v1('patente');
