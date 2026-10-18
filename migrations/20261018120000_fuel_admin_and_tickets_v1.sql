-- Combustible desde Administración y tickets guardados · 18/10/2026 (autorizado por el dueño)
-- 1) Administración carga una carga de combustible dentro de una jornada (el chofer y el camión salen de la jornada).
--    La rendición y el sueldo se recalculan solos con el disparador que ya existe (tg_fuel_sync_rendicion).
-- 2) La foto del ticket queda guardada (espacio privado fuel-tickets) y se puede ver desde Administración y Supervisión.
--    El chofer guarda la foto que escaneó; Administración puede adjuntar o cambiar el ticket de cualquier carga.
alter table public.fuel_records
  add column if not exists ticket_path text,
  add column if not exists ticket_mime text,
  add column if not exists ticket_uploaded_at timestamptz,
  add column if not exists ticket_uploaded_by uuid;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('fuel-tickets', 'fuel-tickets', false, 10485760,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'])
on conflict (id) do nothing;

-- Cada usuario sube en su carpeta; ven los tickets Administración, Supervisión y quien lo subió.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'fuel_tickets_insert_own') then
    create policy fuel_tickets_insert_own on storage.objects for insert to authenticated
      with check (bucket_id = 'fuel-tickets' and (storage.foldername(name))[1] = (select auth.uid())::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'fuel_tickets_select') then
    create policy fuel_tickets_select on storage.objects for select to authenticated
      using (bucket_id = 'fuel-tickets' and ((storage.foldername(name))[1] = (select auth.uid())::text
        or app_private.current_auxilios_role() = any (array['administracion','supervision'])));
  end if;
end $$;

create or replace function public.admin_create_fuel_record_v1(p_log_id integer, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path to 'public', 'app_private', 'pg_temp' as $function$
declare
  v_role text := app_private.current_auxilios_role();
  v_log public.daily_logs%rowtype;
  v_fuel_date date := nullif(p_payload->>'fuel_date', '')::date;
  v_liters numeric := nullif(p_payload->>'liters', '')::numeric;
  v_price numeric := nullif(p_payload->>'price_per_liter', '')::numeric;
  v_km integer := nullif(p_payload->>'km_at_load', '')::integer;
  v_payment text := nullif(btrim(p_payload->>'payment_method'), '');
  v_payment_app text := nullif(btrim(p_payload->>'payment_app'), '');
  v_station text := nullif(btrim(p_payload->>'gas_station'), '');
  v_reason text := btrim(coalesce(p_payload->>'reason', ''));
  v_fuel_id integer;
begin
  if v_role <> 'administracion' then raise exception 'Solo Administración puede cargar combustible en una jornada' using errcode = '42501'; end if;
  if jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' then raise exception 'Carga útil inválida'; end if;
  select * into v_log from public.daily_logs where log_id = p_log_id;
  if not found then raise exception 'Jornada inexistente'; end if;
  if v_log.status = 'voided' then raise exception 'La jornada está anulada'; end if;
  if v_log.truck_id is null then raise exception 'La jornada no tiene camión'; end if;
  v_fuel_date := coalesce(v_fuel_date, v_log.log_date);
  if v_liters is null or v_liters <= 0 then raise exception 'Los litros deben ser mayores a cero'; end if;
  if v_price is null or v_price <= 0 then raise exception 'El precio por litro debe ser mayor a cero'; end if;
  if v_km is not null and v_km < 0 then raise exception 'El kilometraje no puede ser negativo'; end if;
  if v_payment not in ('efectivo','transferencia','app','tarjeta') then raise exception 'Medio de pago inválido'; end if;
  if v_payment = 'app' and v_payment_app is null then raise exception 'La app de pago es obligatoria'; end if;
  if char_length(v_reason) < 5 then raise exception 'Indicá el motivo de la carga (al menos 5 caracteres)'; end if;

  insert into public.fuel_records(truck_id, log_id, fuel_date, liters, price_per_liter, km_at_load,
    payment_method, payment_app, gas_station, created_at_device, created_by, correction_reason)
  values (v_log.truck_id, v_log.log_id, v_fuel_date, v_liters, v_price, v_km,
    v_payment, case when v_payment = 'app' then v_payment_app end, v_station, clock_timestamp(), auth.uid(),
    'Cargada por Administración: ' || v_reason)
  returning fuel_id into v_fuel_id;

  -- Si la rendición de la jornada ya estaba aprobada, queda observada para revisarla.
  update public.rendicion_cierre
  set admin_status = 'observada', admin_by = auth.uid(), admin_at = now(),
      admin_nota = concat_ws(E'\n', nullif(admin_nota, ''), format('Combustible #%s cargado por Administración: %s', v_fuel_id, v_reason))
  where log_id = v_log.log_id and admin_status = 'aprobada';

  return jsonb_build_object('fuel_id', v_fuel_id, 'log_id', v_log.log_id, 'truck_id', v_log.truck_id,
    'journey_closed', v_log.status = 'closed', 'rendicion_observed', found);
end $function$;
revoke all on function public.admin_create_fuel_record_v1(integer, jsonb) from public, anon;
grant execute on function public.admin_create_fuel_record_v1(integer, jsonb) to authenticated;

create or replace function public.set_fuel_record_ticket_v1(p_fuel_id integer, p_path text, p_mime text)
returns jsonb language plpgsql security definer set search_path to 'public', 'app_private', 'pg_temp' as $function$
declare
  v_role text := app_private.current_auxilios_role();
  v_uid uuid := auth.uid();
  r public.fuel_records%rowtype;
  v_path text := nullif(btrim(coalesce(p_path, '')), '');
  v_mime text := lower(nullif(btrim(coalesce(p_mime, '')), ''));
begin
  if v_uid is null then raise exception 'Usuario requerido'; end if;
  select * into r from public.fuel_records where fuel_id = p_fuel_id for update;
  if not found then raise exception 'Carga de combustible inexistente'; end if;
  if v_role = 'administracion' then
    null;
  elsif v_role = 'chofer' then
    -- El chofer sólo adjunta el ticket de la carga que hizo él, en sus primeros días.
    if r.created_by is distinct from v_uid then raise exception 'Esta carga no es tuya' using errcode = '42501'; end if;
    if r.created_at < now() - interval '7 days' then raise exception 'Pasaron más de 7 días: pedile a Administración que adjunte el ticket'; end if;
  else
    raise exception 'Sin permiso para adjuntar tickets' using errcode = '42501';
  end if;
  if v_path is null then raise exception 'Falta el archivo del ticket'; end if;
  if split_part(v_path, '/', 1) <> v_uid::text then raise exception 'Ruta del ticket inválida'; end if;
  if v_mime not in ('image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf') then raise exception 'Formato de ticket no admitido'; end if;
  update public.fuel_records set ticket_path = v_path, ticket_mime = v_mime, ticket_uploaded_at = now(), ticket_uploaded_by = v_uid
  where fuel_id = p_fuel_id;
  return jsonb_build_object('fuel_id', p_fuel_id, 'ticket_path', v_path);
end $function$;
revoke all on function public.set_fuel_record_ticket_v1(integer, text, text) from public, anon;
grant execute on function public.set_fuel_record_ticket_v1(integer, text, text) to authenticated;
