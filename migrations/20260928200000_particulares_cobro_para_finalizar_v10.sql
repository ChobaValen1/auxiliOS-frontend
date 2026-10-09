-- Particulares v10: no se puede finalizar un servicio particular si los pagos
-- registrados no cubren el presupuesto. Vale para todos los caminos de cierre
-- (Finalizar, revisión del remito, crear y finalizar desde un ingreso).
-- El cobro que informó el chofer cuenta recién cuando se aprueba.

create or replace function app_private.require_private_paid_v1()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_balance numeric; v_pending boolean;
begin
  v_balance := coalesce((app_private.service_balance_v1(new.service_id)->>'balance')::numeric, 0);
  if v_balance > 0.009 then
    select exists (select 1 from public.service_collection_reports c
                    where c.service_id = new.service_id and c.status = 'pending' and jsonb_array_length(c.lines) > 0)
      into v_pending;
    raise exception 'No se puede finalizar: falta registrar el cobro de $% del presupuesto.%',
      replace(to_char(round(v_balance), 'FM999,999,999'), ',', '.'),
      case when v_pending then ' Aprobá el cobro que informó el chofer o registrá el pago.' else ' Registrá el pago.' end
      using errcode = 'P0001';
  end if;
  return new;
end
$function$;
revoke all on function app_private.require_private_paid_v1() from public, anon, authenticated;

drop trigger if exists operator_services_require_private_paid_v1 on public.operator_services;
create trigger operator_services_require_private_paid_v1
  before update of status on public.operator_services
  for each row
  when (new.status = 'completed' and old.status is distinct from 'completed' and new.quoted_total is not null)
  execute function app_private.require_private_paid_v1();
