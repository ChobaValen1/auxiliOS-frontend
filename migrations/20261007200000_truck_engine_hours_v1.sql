-- Horas de motor en las jornadas, para los camiones que tienen horómetro.
-- · trucks.registra_horas: interruptor por camión (apagado en todos). Sólo
--   los camiones con el interruptor encendido piden horas al chofer.
-- · daily_logs: horas al abrir y al cerrar, lo que leyó la IA y de dónde
--   salió el dato, igual que los km.
-- · La jornada que abrió con horas no se puede cerrar sin horas, y las horas
--   finales no pueden ser menores a las iniciales.
-- · Al cerrar, las horas del camión (current_hours) se actualizan solas.
-- Todo aditivo: con el interruptor apagado nada cambia para el chofer.

alter table public.trucks
  add column if not exists registra_horas boolean not null default false;

alter table public.daily_logs
  add column if not exists horas_inicio        numeric(10,1),
  add column if not exists horas_final         numeric(10,1),
  add column if not exists horas_inicio_ia     numeric(10,1),
  add column if not exists horas_final_ia      numeric(10,1),
  add column if not exists horas_inicio_origen text,
  add column if not exists horas_final_origen  text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'daily_logs_horas_no_negativas') then
    alter table public.daily_logs add constraint daily_logs_horas_no_negativas
      check ((horas_inicio is null or horas_inicio >= 0) and (horas_final is null or horas_final >= 0));
  end if;
end $$;

-- El chofer no puede prender ni apagar el interruptor de su camión.
create or replace function public.guard_truck_driver_update()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare v_role text := app_private.current_auxilios_role();
begin
  if auth.role() = 'service_role' or current_user = 'postgres' or v_role = 'administracion' then return new; end if;
  if v_role <> 'chofer' then raise exception 'TRUCK_WRITE_NOT_ALLOWED' using errcode = '42501'; end if;
  if new.plate is distinct from old.plate or new.brand is distinct from old.brand or new.model is distinct from old.model
     or new.year is distinct from old.year or new.vin is distinct from old.vin or new.current_hours is distinct from old.current_hours
     or new.status is distinct from old.status or new.assigned_to is distinct from old.assigned_to or new.notes is distinct from old.notes
     or new.created_at is distinct from old.created_at or new.numero_interno is distinct from old.numero_interno
     or new.foto_url is distinct from old.foto_url or new.tipo_equipo is distinct from old.tipo_equipo
     or new.odometer_epoch_started_at is distinct from old.odometer_epoch_started_at
     or new.odometer_epoch_base_km is distinct from old.odometer_epoch_base_km
     or new.registra_horas is distinct from old.registra_horas then
    raise exception 'TRUCK_FIELDS_IMMUTABLE' using errcode = '42501';
  end if;
  if new.current_km is distinct from old.current_km and not exists(
    select 1 from public.daily_logs d
    where d.driver_id=auth.uid() and d.truck_id=old.truck_id and d.status='closed'
      and d.log_date>=current_date-2 and d.km_final=new.current_km
      and (new.current_km>=old.current_km or coalesce(d.km_excepcion,false)
        or (old.odometer_epoch_started_at is not null
          and coalesce(d.closed_at,d.updated_at,d.created_at)>=old.odometer_epoch_started_at
          and new.current_km>=coalesce(old.odometer_epoch_base_km,0)))
  ) then raise exception 'TRUCK_KM_NOT_LINKED_TO_JOURNEY' using errcode = '42501'; end if;
  return new;
end;
$function$;

-- Reglas de la jornada del chofer: las de siempre más las de horas.
create or replace function public.enforce_daily_logs_mutation()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_role text := app_private.current_auxilios_role();
  v_registra_horas boolean;
begin
  if tg_op = 'INSERT' then
    if v_role = 'chofer' then
      if new.driver_id is distinct from auth.uid() then
        raise exception 'JORNADA_NO_AUTORIZADA: solo podés crear tu propia jornada' using errcode = '42501';
      end if;
      if new.status is distinct from 'open' then
        raise exception 'JORNADA_ESTADO_INVALIDO: una jornada nueva debe iniciar abierta' using errcode = '23514';
      end if;
      if new.km_final is not null or new.hora_fin is not null or new.horas_final is not null then
        raise exception 'JORNADA_CIERRE_INVALIDO: una jornada nueva no puede incluir datos de cierre' using errcode = '23514';
      end if;
      select t.registra_horas into v_registra_horas from public.trucks t where t.truck_id = new.truck_id;
      if coalesce(v_registra_horas, false) and new.horas_inicio is null then
        raise exception 'JORNADA_HORAS_REQUERIDAS: este camión registra horas de motor; cargá las horas iniciales' using errcode = '23514';
      end if;
      new.closed_at := null;
      new.received_at := now();
      new.sync_status := 'synced';
    elsif v_role = 'supervision' then
      raise exception 'JORNADA_NO_AUTORIZADA: supervisión no puede crear jornadas' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if v_role = 'chofer' then
      if old.driver_id is distinct from auth.uid() or new.driver_id is distinct from old.driver_id then
        raise exception 'JORNADA_NO_AUTORIZADA: solo podés modificar tu propia jornada' using errcode = '42501';
      end if;

      if new.truck_id is distinct from old.truck_id
         or new.log_date is distinct from old.log_date
         or new.km_inicio is distinct from old.km_inicio
         or new.hora_inicio is distinct from old.hora_inicio
         or new.created_at_device is distinct from old.created_at_device
         or new.received_at is distinct from old.received_at
         or new.created_at is distinct from old.created_at
         or new.foto_km_inicio is distinct from old.foto_km_inicio
         or new.patente_camion is distinct from old.patente_camion
         or new.grilla_motivo is distinct from old.grilla_motivo
         or new.km_inicio_ia is distinct from old.km_inicio_ia
         or new.km_inicio_origen is distinct from old.km_inicio_origen
         or new.horas_inicio is distinct from old.horas_inicio
         or new.horas_inicio_ia is distinct from old.horas_inicio_ia
         or new.horas_inicio_origen is distinct from old.horas_inicio_origen then
        raise exception 'JORNADA_INMUTABLE: no se pueden alterar los datos de apertura' using errcode = '42501';
      end if;

      if old.status = 'open' and new.status = 'closed' then
        if new.km_final is null or new.hora_fin is null then
          raise exception 'JORNADA_CIERRE_INCOMPLETO: faltan KM u hora final' using errcode = '23514';
        end if;
        if new.km_final < old.km_inicio and coalesce(new.km_excepcion, false) = false then
          raise exception 'JORNADA_KM_INVALIDO: el KM final no puede ser menor al inicial sin excepción' using errcode = '23514';
        end if;
        -- Sólo se exigen horas si la jornada abrió con horas: una jornada abierta
        -- antes de prender el interruptor se cierra como siempre.
        if old.horas_inicio is not null and new.horas_final is null then
          raise exception 'JORNADA_HORAS_REQUERIDAS: cargá las horas de motor finales' using errcode = '23514';
        end if;
        if new.horas_final is not null and old.horas_inicio is not null and new.horas_final < old.horas_inicio then
          raise exception 'JORNADA_HORAS_INVALIDAS: las horas finales no pueden ser menores a las iniciales' using errcode = '23514';
        end if;
        new.closed_at := now();
        new.sync_status := 'synced';
        return new;
      end if;

      if old.status = 'closed' and new.status = 'open' then
        if old.closed_at is null or old.closed_at < now() - interval '5 minutes' then
          raise exception 'JORNADA_CERRADA: ya no puede reabrirse' using errcode = '42501';
        end if;
        new.km_final := null;
        new.km_final_ia := null;
        new.km_final_origen := null;
        new.foto_km_final := null;
        new.hora_fin := null;
        new.horas_final := null;
        new.horas_final_ia := null;
        new.horas_final_origen := null;
        new.in_workshop := false;
        new.workshop_detail := null;
        new.notas := null;
        new.km_excepcion := false;
        new.closed_at := null;
        return new;
      end if;

      raise exception 'JORNADA_TRANSICION_INVALIDA: la jornada solo puede cerrarse o revertirse inmediatamente' using errcode = '42501';
    elsif v_role = 'supervision' then
      raise exception 'JORNADA_NO_AUTORIZADA: supervisión no puede modificar jornadas' using errcode = '42501';
    end if;
    return new;
  end if;

  return coalesce(new, old);
end;
$function$;

-- Al cerrar una jornada con horas, el camión queda con esas horas. Se guarda
-- el entero hacia abajo (current_hours es entero): la próxima apertura nunca
-- queda por debajo de la referencia.
create or replace function public.fn_actualizar_horas_camion()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.status = 'closed' and new.horas_final is not null
     and (old.status is distinct from 'closed' or old.horas_final is distinct from new.horas_final) then
    update public.trucks
       set current_hours = floor(new.horas_final)::int
     where truck_id = new.truck_id
       and coalesce(current_hours, 0) <= floor(new.horas_final)::int;
  end if;
  return new;
end;
$function$;

create or replace trigger trg_actualizar_horas_camion
  after update on public.daily_logs
  for each row execute function public.fn_actualizar_horas_camion();

-- El chofer ve si el camión registra horas y con cuántas cerró la última vez.
create or replace function public.get_driver_truck_availability_v1()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'app_private', 'pg_temp'
as $function$
declare
  v_role text := app_private.current_auxilios_role();
  v_driver uuid := auth.uid();
  v_result jsonb;
begin
  if v_role <> 'chofer' then
    raise exception 'Solo un chofer puede consultar disponibilidad de moviles'
      using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'truck_id', t.truck_id,
      'plate', t.plate,
      'brand', t.brand,
      'model', t.model,
      'numero_interno', t.numero_interno,
      'current_km', t.current_km,
      'registra_horas', t.registra_horas,
      'current_hours', coalesce(last_hours.horas_final, t.current_hours),
      'status', t.status,
      'has_open_journey', open_log.log_id is not null,
      'is_own_open_journey', open_log.driver_id = v_driver,
      'open_log_id', case when open_log.driver_id = v_driver then open_log.log_id else null end,
      'occupied_by_name', case when open_log.driver_id is not null then coalesce(u.full_name, 'Otro chofer') else null end
    ) order by t.numero_interno nulls last, t.plate
  ), '[]'::jsonb)
  into v_result
  from public.trucks t
  left join lateral (
    select dl.log_id, dl.driver_id
    from public.daily_logs dl
    where dl.truck_id = t.truck_id
      and dl.status = 'open'
    order by dl.created_at desc nulls last, dl.log_id desc
    limit 1
  ) open_log on true
  left join lateral (
    select dl.horas_final
    from public.daily_logs dl
    where dl.truck_id = t.truck_id
      and dl.status = 'closed'
      and dl.horas_final is not null
    order by dl.closed_at desc nulls last, dl.log_id desc
    limit 1
  ) last_hours on true
  left join public.users u on u.user_id = open_log.driver_id
  where t.status = 'active';

  return v_result;
end;
$function$;
