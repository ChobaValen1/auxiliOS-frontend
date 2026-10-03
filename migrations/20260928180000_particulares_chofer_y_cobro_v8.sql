-- Particulares v8: el chofer marca Particular en el remito sin asignación, y el
-- operador completa el cobro de un particular (saldo después de una seña).
--
-- 1) driver_service_intakes guarda si el chofer lo marcó como particular, el
--    monto acordado y lo que cobró. save_driver_ad_hoc_remito_v4 lo registra.
-- 2) get_driver_service_intake_context_v1 lo devuelve para que Operaciones
--    abra directo el alta de Particular con esos datos.
-- 3) register_service_payment_v1 registra quién recibió el pago.

alter table public.driver_service_intakes
  add column if not exists client_kind text not null default 'prestadora',
  add column if not exists agreed_amount numeric(14,2),
  add column if not exists private_collection jsonb;
alter table public.driver_service_intakes drop constraint if exists driver_service_intakes_client_kind_check;
alter table public.driver_service_intakes add constraint driver_service_intakes_client_kind_check
  check (client_kind in ('prestadora', 'particular'));
alter table public.driver_service_intakes drop constraint if exists driver_service_intakes_agreed_amount_check;
alter table public.driver_service_intakes add constraint driver_service_intakes_agreed_amount_check
  check (client_kind <> 'particular' or agreed_amount > 0);
comment on column public.driver_service_intakes.client_kind is 'Lo que marcó el chofer en el remito sin asignación: prestadora o particular.';

create or replace function public.save_driver_ad_hoc_remito_v4(p_payload jsonb, p_client_operation_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_c jsonb := p_payload->'customer_collections';
  v_result jsonb;
  v_norm jsonb;
  v_amount numeric;
  v_total numeric;
begin
  if coalesce(v_c->>'kind', '') <> 'private_ad_hoc' then
    return public.save_driver_ad_hoc_remito_v3(p_payload - 'customer_collections', p_client_operation_id);
  end if;
  v_amount := round(coalesce(nullif(v_c->>'quoted_total', '')::numeric, 0), 2);
  if v_amount <= 0 then raise exception 'Completá el monto acordado con el cliente'; end if;
  v_norm := app_private.normalize_private_collection_v1(v_c);
  select coalesce(sum((l->>'amount')::numeric), 0) into v_total from jsonb_array_elements(v_norm->'lines') l;
  if v_total > v_amount + 0.009 then raise exception 'Lo cobrado no puede superar el monto acordado'; end if;
  if (v_norm->>'not_collected')::boolean and v_norm->>'reason' is null then
    raise exception 'Indicá por qué no cobraste';
  end if;

  v_result := public.save_driver_ad_hoc_remito_v3(p_payload - 'customer_collections', p_client_operation_id);
  if coalesce((v_result->>'idempotent')::boolean, false) then return v_result; end if;

  update public.driver_service_intakes
     set client_kind = 'particular', agreed_amount = v_amount, private_collection = v_norm, updated_at = now()
   where intake_id = (v_result->>'intake_id')::uuid and driver_id = auth.uid();
  return v_result || jsonb_build_object('client_kind', 'particular', 'agreed_amount', v_amount);
end
$function$;
revoke all on function public.save_driver_ad_hoc_remito_v4(jsonb, uuid) from public, anon;
grant execute on function public.save_driver_ad_hoc_remito_v4(jsonb, uuid) to authenticated;

create or replace function public.get_driver_service_intake_context_v1(p_intake_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare i public.driver_service_intakes%rowtype; r public.remitos%rowtype;
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'') not in ('operador','administracion','supervision') then
    raise exception 'Sin permiso para consultar ingresos';
  end if;
  select * into i from public.driver_service_intakes where intake_id=p_intake_id;
  if not found then raise exception 'Ingreso inexistente'; end if;
  select * into r from public.remitos where remito_id=i.remito_id;
  if not found then raise exception 'El ingreso todavía no tiene remito'; end if;
  return jsonb_build_object(
    'version',1,'driver_activated',i.driver_activated,'activation_reason_code',i.activation_reason_code,'intake_id',i.intake_id,'intake_number',i.intake_number,'status',i.status,
    'document_status',i.document_status,'linked_service_id',i.linked_service_id,
    'client_kind',i.client_kind,'agreed_amount',i.agreed_amount,'private_collection',i.private_collection,
    'service',app_private.driver_intake_service_seed_v1(to_jsonb(i),to_jsonb(r)),
    'remito',jsonb_build_object('remito_id',r.remito_id,'nro_remito',r.nro_remito,'status',r.status,
      'firmado_at',r.firmado_at,'created_at',r.created_at,'created_at_device',r.created_at_device,
      'km_reales',r.km_reales,'service_type',r.tipo_servicio),
    'addons',case when i.driver_activated then '{"tolls":[],"excesses":[],"evidence":[]}'::jsonb else public.get_driver_remito_addons_v2(r.remito_id) end
  );
end;
$function$;

create or replace function public.register_service_payment_v1(
  p_service_id uuid, p_kind text, p_amount numeric, p_method text, p_note text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_role text := coalesce(app_private.current_auxilios_role(), '');
  v_s public.operator_services%rowtype;
  v_saldo numeric;
begin
  if auth.uid() is null then raise exception 'Sesión requerida'; end if;
  select * into v_s from public.operator_services where service_id = p_service_id for update;
  if not found or v_s.quoted_total is null then raise exception 'No es un servicio particular'; end if;
  if not (v_role in ('operador', 'administracion')
          or (v_role = 'chofer' and v_s.assigned_driver_id = auth.uid())) then
    raise exception 'Sin permiso para registrar cobros de este servicio';
  end if;
  if p_kind not in ('sena', 'saldo') then raise exception 'Tipo de cobro inválido'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Completá el monto'; end if;
  if coalesce(p_method, '') not in ('cash', 'transfer', 'card', 'mercado_pago', 'other') then raise exception 'Elegí el medio de pago'; end if;
  v_saldo := (app_private.service_balance_v1(p_service_id)->>'balance')::numeric;
  if p_amount > v_saldo + 0.009 then
    raise exception 'El monto supera el saldo pendiente ($%)', v_saldo;
  end if;
  insert into public.service_payments (service_id, kind, amount, method, received_by, note)
  values (p_service_id, p_kind, round(p_amount, 2), p_method, auth.uid(), nullif(btrim(p_note), ''));
  return app_private.service_balance_v1(p_service_id);
end
$function$;
