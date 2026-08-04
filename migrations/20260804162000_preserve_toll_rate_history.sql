-- AuxiliOS · Mantener vigencias anteriores visibles en el historial

create or replace function public.save_toll_rate(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'app_private', 'pg_temp'
as $function$
declare
  v_role text := app_private.current_auxilios_role();
  v_uid uuid := auth.uid();
  v_toll_id uuid := nullif(p_payload->>'toll_id', '')::uuid;
  v_category text := lower(coalesce(nullif(btrim(p_payload->>'vehicle_category'), ''), 'light_2_axles'));
  v_payment text := lower(coalesce(nullif(btrim(p_payload->>'payment_method'), ''), 'any'));
  v_amount numeric := coalesce(nullif(p_payload->>'amount', '')::numeric, -1);
  v_currency text := upper(coalesce(nullif(btrim(p_payload->>'currency'), ''), 'ARS'));
  v_from date := coalesce(nullif(p_payload->>'valid_from', '')::date, current_date);
  v_until date := nullif(p_payload->>'valid_until', '')::date;
  v_row public.toll_rates%rowtype;
begin
  if v_uid is null or v_role <> 'administracion' then
    raise exception 'Solo administración puede gestionar los importes de peajes';
  end if;
  if v_toll_id is null or not exists (
    select 1 from public.toll_locations where toll_id = v_toll_id
  ) then
    raise exception 'Seleccioná un peaje válido';
  end if;
  if v_amount < 0 then
    raise exception 'El importe no puede ser negativo';
  end if;
  if v_payment not in ('any','cash','electronic','telepass','manual') then
    raise exception 'Modalidad de pago inválida';
  end if;
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'Moneda inválida';
  end if;
  if v_until is not null and v_until < v_from then
    raise exception 'La vigencia hasta no puede ser anterior a la vigencia desde';
  end if;

  -- Cerrar la vigencia anterior sin desactivarla: sigue siendo parte del historial.
  update public.toll_rates
  set valid_until = v_from - 1
  where toll_id = v_toll_id
    and vehicle_category = v_category
    and payment_method = v_payment
    and valid_from < v_from
    and is_active
    and (valid_until is null or valid_until >= v_from);

  insert into public.toll_rates(
    toll_id, vehicle_category, payment_method, amount, currency,
    valid_from, valid_until, notes, is_active, created_by
  )
  values (
    v_toll_id,
    v_category,
    v_payment,
    round(v_amount, 2),
    v_currency,
    v_from,
    v_until,
    nullif(btrim(p_payload->>'notes'), ''),
    coalesce((p_payload->>'is_active')::boolean, true),
    v_uid
  )
  returning * into v_row;

  return to_jsonb(v_row);
end;
$function$;

revoke all on function public.save_toll_rate(jsonb) from public, anon;
grant execute on function public.save_toll_rate(jsonb) to authenticated;
