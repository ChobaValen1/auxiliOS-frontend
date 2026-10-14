-- Primer precio de una prestadora sin tarifario: el contenedor técnico se creaba
-- directamente 'active' y vacío, y el chequeo "al menos un concepto principal"
-- lo rechazaba siempre (todavía no puede tener conceptos). Ahora se crea en
-- borrador (así el motor inicializa reglas y códigos) y se activa en el mismo
-- paso con una marca local que sólo vale para ese contenedor vacío.
create or replace function app_private.prepare_rate_card_activation()
 returns trigger language plpgsql set search_path to 'pg_catalog','public' as $function$
begin
 if new.status='active' and (tg_op='INSERT' or old.status is distinct from 'active') then
  if not exists(select 1 from public.company_rate_items where rate_card_id=new.rate_card_id and is_active and can_be_primary)
     and not (coalesce(current_setting('app.price_container_bootstrap',true),'')=new.rate_card_id::text
              and not exists(select 1 from public.company_rate_items where rate_card_id=new.rate_card_id))
  then raise exception 'El tarifario debe tener al menos un concepto principal.';end if;
  update public.company_rate_cards set status='expired',valid_until=coalesce(valid_until,greatest(valid_from,new.valid_from-1)),updated_at=now(),updated_by=auth.uid()
  where contract_id=new.contract_id and status='active' and rate_card_id<>new.rate_card_id;
 end if;return new;
end $function$;

CREATE OR REPLACE FUNCTION app_private.current_price_card_for_company(p_company_id uuid, p_create boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_contract public.company_contracts%rowtype; v_card uuid; v_version integer;
BEGIN
  v_card:=app_private.price_card_for_company_date(p_company_id,current_date);
  IF v_card IS NOT NULL OR NOT p_create THEN RETURN v_card; END IF;

  SELECT c.* INTO v_contract
  FROM public.company_contracts c
  WHERE c.company_id=p_company_id AND c.status='active'
    AND c.valid_from<=current_date AND (c.valid_until IS NULL OR c.valid_until>=current_date)
  ORDER BY c.is_primary DESC,c.valid_from DESC,c.created_at DESC
  LIMIT 1;

  IF v_contract.contract_id IS NULL THEN
    INSERT INTO public.company_contracts(company_id,name,status,valid_from,currency,is_primary,notes)
    VALUES(p_company_id,'Acuerdo comercial','active',current_date,'ARS',true,'Contenedor técnico de precios')
    RETURNING * INTO v_contract;
  END IF;

  SELECT coalesce(max(r.version),0)+1 INTO v_version
  FROM public.company_rate_cards r WHERE r.contract_id=v_contract.contract_id;
  INSERT INTO public.company_rate_cards(contract_id,name,version,status,valid_from,valid_until,currency,notes)
  VALUES(v_contract.contract_id,'Precios actuales',v_version,'draft',current_date,NULL,coalesce(v_contract.currency,'ARS'),'Contenedor técnico de precios actuales')
  RETURNING rate_card_id INTO v_card;
  PERFORM set_config('app.price_container_bootstrap',v_card::text,true);
  UPDATE public.company_rate_cards SET status='active' WHERE rate_card_id=v_card;
  PERFORM set_config('app.price_container_bootstrap','',true);
  RETURN v_card;
END
$function$;
