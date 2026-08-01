-- AuxiliOS · Corrección del guardado de servicios en tarifarios
-- Evita la ambigüedad entre la variable local y company_branches.company_id.

create or replace function app_private.validate_company_rate_item()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  v_company_id uuid;
  v_card_status text;
  v_concept public.service_concepts%rowtype;
begin
  select ct.company_id, rc.status
    into v_company_id, v_card_status
  from public.company_rate_cards rc
  join public.company_contracts ct on ct.contract_id = rc.contract_id
  where rc.rate_card_id = case
    when tg_op = 'DELETE' then old.rate_card_id
    else new.rate_card_id
  end;

  if v_company_id is null then
    raise exception 'Tarifario inexistente.';
  end if;

  if v_card_status <> 'draft' then
    raise exception 'Solo se puede modificar un tarifario en borrador.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if new.branch_id is not null and not exists (
    select 1
    from public.company_branches b
    where b.branch_id = new.branch_id
      and b.company_id = v_company_id
      and b.is_active
  ) then
    raise exception 'La sucursal no pertenece a la empresa o está inactiva.';
  end if;

  select sc.*
    into v_concept
  from public.service_concepts sc
  where sc.concept_id = new.concept_id
    and sc.is_active;

  if v_concept.concept_id is null then
    raise exception 'Concepto inexistente o inactivo.';
  end if;

  if not (new.can_be_primary or new.can_be_secondary) then
    raise exception 'El concepto debe habilitarse como principal, secundario o mixto.';
  end if;

  if new.can_be_primary and not v_concept.default_can_be_primary then
    raise exception 'Este concepto no puede utilizarse como principal.';
  end if;

  if new.can_be_secondary and not v_concept.default_can_be_secondary then
    raise exception 'Este concepto no puede utilizarse como secundario.';
  end if;

  new.service_code := v_concept.code;
  new.service_name := v_concept.name;
  new.base_price := case
    when new.can_be_primary then new.primary_price
    else new.secondary_price
  end;

  return new;
end;
$function$;
