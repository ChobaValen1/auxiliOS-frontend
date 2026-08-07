-- Rendiciones: la fuente de verdad económica es la jornada (log_id), no la fecha de creación del remito.

create or replace function public.calcular_efectivo_jornada(p_log_id integer)
returns numeric
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(
    sum(
      case when r.pago_1_metodo = 'efectivo' then coalesce(r.pago_1_monto, 0) else 0 end +
      case when r.pago_2_metodo = 'efectivo' then coalesce(r.pago_2_monto, 0) else 0 end
    ),
    0
  )::numeric
  from public.remitos r
  where r.log_id = p_log_id
    and r.status <> 'anulado';
$function$;

create or replace function public.calcular_gastos_jornada(p_log_id integer)
returns numeric
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  with jornada as (
    select dl.log_id, dl.truck_id, dl.log_date
    from public.daily_logs dl
    where dl.log_id = p_log_id
  )
  select coalesce(sum(fr.total_cost), 0)::numeric
  from public.fuel_records fr
  cross join jornada j
  where fr.payment_method = 'efectivo'
    and coalesce(fr.status, 'active') = 'active'
    and (
      fr.log_id = p_log_id
      or (
        fr.log_id is null
        and fr.truck_id = j.truck_id
        and fr.fuel_date = j.log_date
        and not exists (
          select 1
          from public.daily_logs dl2
          where dl2.truck_id = j.truck_id
            and dl2.log_date = j.log_date
            and dl2.log_id <> p_log_id
        )
      )
    );
$function$;

create or replace function app_private.sync_rendicion_jornada(
  p_log_id integer,
  p_force_observe boolean default false,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path to 'public', 'app_private', 'pg_temp'
as $function$
declare
  v_efectivo numeric;
  v_gastos numeric;
begin
  if p_log_id is null then
    return;
  end if;

  v_efectivo := public.calcular_efectivo_jornada(p_log_id);
  v_gastos := public.calcular_gastos_jornada(p_log_id);

  update public.rendicion_cierre rc
     set efectivo_esperado = v_efectivo,
         gastos_sistema = v_gastos,
         admin_status = case
           when p_force_observe and rc.admin_status = 'aprobada' then 'observada'
           else rc.admin_status
         end,
         admin_by = case
           when p_force_observe and rc.admin_status = 'aprobada' then null
           else rc.admin_by
         end,
         admin_at = case
           when p_force_observe and rc.admin_status = 'aprobada' then now()
           else rc.admin_at
         end,
         admin_nota = case
           when p_force_observe and rc.admin_status = 'aprobada' then
             concat_ws(E'\n', nullif(rc.admin_nota, ''), coalesce(nullif(p_reason, ''), 'Revisión automática requerida por una corrección económica posterior.'))
           else rc.admin_nota
         end
   where rc.log_id = p_log_id
     and rc.estado <> 'rechazado';
end;
$function$;

create or replace function public.tg_remitos_sync_rendicion()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'app_private', 'pg_temp'
as $function$
declare
  v_economic_change boolean := false;
  v_reason text;
begin
  if tg_op = 'INSERT' then
    perform app_private.sync_rendicion_jornada(
      new.log_id,
      true,
      format('Revisión automática: se agregó el remito %s a la jornada después del cierre de rendición.', coalesce(new.nro_remito, new.remito_id::text))
    );
    return null;
  end if;

  if tg_op = 'DELETE' then
    perform app_private.sync_rendicion_jornada(
      old.log_id,
      true,
      format('Revisión automática: se eliminó el remito %s vinculado a la jornada.', coalesce(old.nro_remito, old.remito_id::text))
    );
    return null;
  end if;

  v_economic_change :=
       new.log_id is distinct from old.log_id
    or new.driver_id is distinct from old.driver_id
    or new.status is distinct from old.status
    or new.imp_peaje is distinct from old.imp_peaje
    or new.imp_excedente is distinct from old.imp_excedente
    or new.imp_otros is distinct from old.imp_otros
    or new.pago_1_metodo is distinct from old.pago_1_metodo
    or new.pago_1_monto is distinct from old.pago_1_monto
    or new.pago_2_metodo is distinct from old.pago_2_metodo
    or new.pago_2_monto is distinct from old.pago_2_monto;

  if not v_economic_change then
    return null;
  end if;

  v_reason := format(
    'Revisión automática: se corrigieron importes, estado o medio de pago del remito %s. Consultar historial del remito para valores anteriores y posteriores.',
    coalesce(new.nro_remito, old.nro_remito, new.remito_id::text, old.remito_id::text)
  );

  if old.log_id is not null then
    perform app_private.sync_rendicion_jornada(old.log_id, true, v_reason);
  end if;

  if new.log_id is not null and new.log_id is distinct from old.log_id then
    perform app_private.sync_rendicion_jornada(new.log_id, true, v_reason);
  end if;

  return null;
end;
$function$;

-- Combustible forma parte del arqueo de la jornada. Mantener gastos_sistema sincronizado
-- cuando una carga vinculada cambia de monto, método, estado o jornada.
create or replace function public.tg_fuel_sync_rendicion()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'app_private', 'pg_temp'
as $function$
declare
  v_economic_change boolean := false;
  v_reason text;
begin
  if tg_op = 'INSERT' then
    if new.log_id is not null then
      perform app_private.sync_rendicion_jornada(new.log_id, true, 'Revisión automática: se agregó una carga de combustible a la jornada.');
    end if;
    return null;
  end if;

  if tg_op = 'DELETE' then
    if old.log_id is not null then
      perform app_private.sync_rendicion_jornada(old.log_id, true, 'Revisión automática: se eliminó una carga de combustible vinculada a la jornada.');
    end if;
    return null;
  end if;

  v_economic_change :=
       new.log_id is distinct from old.log_id
    or new.liters is distinct from old.liters
    or new.price_per_liter is distinct from old.price_per_liter
    or new.payment_method is distinct from old.payment_method
    or new.status is distinct from old.status;

  if not v_economic_change then
    return null;
  end if;

  v_reason := 'Revisión automática: se corrigió una carga de combustible vinculada a la jornada.';

  if old.log_id is not null then
    perform app_private.sync_rendicion_jornada(old.log_id, true, v_reason);
  end if;
  if new.log_id is not null and new.log_id is distinct from old.log_id then
    perform app_private.sync_rendicion_jornada(new.log_id, true, v_reason);
  end if;

  return null;
end;
$function$;

drop trigger if exists trg_fuel_sync_rendicion on public.fuel_records;
create trigger trg_fuel_sync_rendicion
after insert or update or delete on public.fuel_records
for each row execute function public.tg_fuel_sync_rendicion();

-- Reparación histórica: recalcular snapshots con la jornada real.
-- Si una rendición aprobada cambia, vuelve a Observada para revisión administrativa.
with recalculo as (
  select rc.rendicion_id,
         public.calcular_efectivo_jornada(rc.log_id) as efectivo_nuevo,
         public.calcular_gastos_jornada(rc.log_id) as gastos_nuevos
  from public.rendicion_cierre rc
  where rc.estado <> 'rechazado'
)
update public.rendicion_cierre rc
   set efectivo_esperado = x.efectivo_nuevo,
       gastos_sistema = x.gastos_nuevos,
       admin_status = case
         when rc.admin_status = 'aprobada'
          and (rc.efectivo_esperado is distinct from x.efectivo_nuevo or rc.gastos_sistema is distinct from x.gastos_nuevos)
           then 'observada'
         else rc.admin_status
       end,
       admin_by = case
         when rc.admin_status = 'aprobada'
          and (rc.efectivo_esperado is distinct from x.efectivo_nuevo or rc.gastos_sistema is distinct from x.gastos_nuevos)
           then null
         else rc.admin_by
       end,
       admin_at = case
         when rc.admin_status = 'aprobada'
          and (rc.efectivo_esperado is distinct from x.efectivo_nuevo or rc.gastos_sistema is distinct from x.gastos_nuevos)
           then now()
         else rc.admin_at
       end,
       admin_nota = case
         when rc.admin_status = 'aprobada'
          and (rc.efectivo_esperado is distinct from x.efectivo_nuevo or rc.gastos_sistema is distinct from x.gastos_nuevos)
           then concat_ws(E'\n', nullif(rc.admin_nota, ''), 'Revisión automática requerida por reparación de asociación jornada/remito.')
         else rc.admin_nota
       end
  from recalculo x
 where rc.rendicion_id = x.rendicion_id
   and (rc.efectivo_esperado is distinct from x.efectivo_nuevo or rc.gastos_sistema is distinct from x.gastos_nuevos);

revoke all on function public.calcular_efectivo_jornada(integer) from public;
revoke all on function public.calcular_gastos_jornada(integer) from public;
grant execute on function public.calcular_efectivo_jornada(integer) to authenticated, service_role;
grant execute on function public.calcular_gastos_jornada(integer) to authenticated, service_role;