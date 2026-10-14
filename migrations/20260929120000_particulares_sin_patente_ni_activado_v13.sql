-- Particulares v13.
--
-- 1) Arribar y Finalizar no exigen la patente en un particular (la patente es
--    opcional al crearlo). El control de campos obligatorios la pedía siempre
--    según la configuración del módulo, y el servicio no se podía arribar ni
--    finalizar (400 en transition_operator_service_v2).
-- 2) Un particular no puede quedar "Activado" (socio ausente / baja): se
--    finaliza o se anula. Lo bloquea la base, para Operaciones y para el chofer.
--    El trigger se llama "a_…" para correr antes que los demás (van por nombre).

do $patch$
declare d text; n text;
begin
  d := pg_get_functiondef('app_private.operator_service_missing_required_v2(uuid,jsonb)'::regprocedure);
  n := replace(d, $a$  req boolean;
begin$a$, $a$  req boolean;
  v_particular boolean;
begin$a$);
  n := replace(n, $a$  if not found then raise exception 'Servicio inexistente'; end if;
$a$, $a$  if not found then raise exception 'Servicio inexistente'; end if;
  v_particular := s.quoted_total is not null
    or exists (select 1 from public.companies c where c.company_id = s.company_id and c.client_kind = 'particular');
$a$);
  n := replace(n, $a$  req:=coalesce(v_modes->>'vehicle_plate','optional')='required';$a$,
                  $a$  req:=coalesce(v_modes->>'vehicle_plate','optional')='required' and not v_particular;$a$);
  if n = d or position('v_particular boolean' in n) = 0 or position('and not v_particular' in n) = 0 then
    raise exception 'operator_service_missing_required_v2 cambió: revisar el parche';
  end if;
  execute n;
end
$patch$;

create or replace function app_private.block_private_activation_v1()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if coalesce(new.driver_activated, false) and not coalesce(old.driver_activated, false)
     and (new.quoted_total is not null
          or exists (select 1 from public.companies c where c.company_id = new.company_id and c.client_kind = 'particular')) then
    raise exception 'Un servicio particular no puede quedar Activado: finalizalo o anulalo';
  end if;
  return new;
end
$function$;
revoke all on function app_private.block_private_activation_v1() from public, anon, authenticated;
drop trigger if exists operator_services_a_block_private_activation_v1 on public.operator_services;
create trigger operator_services_a_block_private_activation_v1
  before update of driver_activated on public.operator_services
  for each row execute function app_private.block_private_activation_v1();
