-- Tercerizados · el operador no ve tarifas ni importes · 19/10/2026 (pedido del dueño)
-- El operador elige el tercerizado y carga km, peajes y cantidades de adicionales; los importes
-- (tarifa por unidad, desglose, total, ajuste) los ve sólo Administración.
--   · outsourced_service_costs: lectura directa sólo Administración.
--   · get_outsourced_service_cost_v1: lo guardado de un servicio; al operador sin importes.
--   · quote / list / set: al operador le llegan sin importes. El ajuste lo carga sólo Administración
--     (si guarda el operador, se conserva el ajuste que ya había).

alter policy outsourced_service_costs_select_staff on public.outsourced_service_costs
  using ((select app_private.current_auxilios_role()) = 'administracion');

-- Saca todo lo que sea plata de un costo o cotización.
create or replace function app_private.outsourced_hide_amounts(j jsonb)
returns jsonb language sql immutable set search_path to 'pg_temp' as $function$
  select case when j is null then null else
    (j - 'base_amount' - 'extras_amount' - 'tolls_payable' - 'adjustment_amount' - 'adjustment_reason' - 'total_amount' - 'rate_snapshot' - 'breakdown')
    || jsonb_build_object('amounts_hidden', true) end
$function$;
revoke all on function app_private.outsourced_hide_amounts(jsonb) from public, anon;

create or replace function public.quote_outsourced_service_cost_v1(p_payload jsonb)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'app_private', 'pg_temp' as $function$
declare v_role text := coalesce(app_private.current_auxilios_role(), ''); q jsonb;
begin
  if v_role not in ('administracion', 'operador') then raise exception 'Sin permiso' using errcode = '42501'; end if;
  q := app_private.outsourced_quote(coalesce(p_payload, '{}'::jsonb)) - 'rate_snapshot';
  if v_role <> 'administracion' then q := app_private.outsourced_hide_amounts(q); end if;
  return q;
end $function$;
revoke all on function public.quote_outsourced_service_cost_v1(jsonb) from public, anon;
grant execute on function public.quote_outsourced_service_cost_v1(jsonb) to authenticated;

create or replace function public.list_outsourced_providers_for_service_v1(p_date date)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'app_private', 'pg_temp' as $function$
declare v_date date := coalesce(p_date, (now() at time zone 'America/Argentina/Buenos_Aires')::date);
  v_admin boolean := coalesce(app_private.current_auxilios_role(), '') = 'administracion';
begin
  if coalesce(app_private.current_auxilios_role(), '') not in ('administracion', 'operador') then raise exception 'Sin permiso' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('provider_id', p.provider_id, 'display_name', p.display_name, 'is_active', p.is_active,
      'has_rate', r.version_id is not null, 'tolls_mode', r.tolls_mode,
      'concepts', coalesce((select jsonb_agg(l->>'concept_id') from jsonb_array_elements(r.lines) l where l->>'calc_mode' <> 'per_unit'), '[]'::jsonb),
      'extras', coalesce((select jsonb_agg(jsonb_build_object('concept_id', l->>'concept_id', 'name', c.name, 'unit', l->>'unit')
                 || case when v_admin then jsonb_build_object('unit_amount', (l->>'unit_amount')::numeric) else '{}'::jsonb end)
                 from jsonb_array_elements(r.lines) l join public.service_concepts c on c.concept_id = (l->>'concept_id')::uuid where l->>'calc_mode' = 'per_unit'), '[]'::jsonb))
      order by p.display_name)
    from public.outsourced_providers p
    left join lateral (select * from app_private.outsourced_rate_at(p.provider_id, v_date)) r on true
    where p.is_active), '[]'::jsonb);
end $function$;
revoke all on function public.list_outsourced_providers_for_service_v1(date) from public, anon;
grant execute on function public.list_outsourced_providers_for_service_v1(date) to authenticated;

-- Lo guardado de un servicio (null si no tiene). locked: ya está en una liquidación.
create or replace function public.get_outsourced_service_cost_v1(p_service_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'app_private', 'pg_temp' as $function$
declare v_role text := coalesce(app_private.current_auxilios_role(), ''); c public.outsourced_service_costs%rowtype; j jsonb;
begin
  if v_role not in ('administracion', 'operador') then raise exception 'Sin permiso' using errcode = '42501'; end if;
  select * into c from public.outsourced_service_costs where service_id = p_service_id;
  if not found then return null; end if;
  j := to_jsonb(c) || jsonb_build_object('locked', c.settlement_id is not null);
  if v_role <> 'administracion' then j := app_private.outsourced_hide_amounts(j) - 'settlement_id'; end if;
  return j;
end $function$;
revoke all on function public.get_outsourced_service_cost_v1(uuid) from public, anon;
grant execute on function public.get_outsourced_service_cost_v1(uuid) to authenticated;

create or replace function public.set_outsourced_service_cost_v1(p_service_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path to 'public', 'app_private', 'pg_temp' as $function$
declare
  v_role text := app_private.current_auxilios_role();
  s public.operator_services%rowtype;
  v_old public.outsourced_service_costs%rowtype;
  v_has_old boolean;
  p jsonb := coalesce(p_payload, '{}'::jsonb);
  q jsonb;
  v_reason text;
  v_row public.outsourced_service_costs%rowtype;
begin
  if coalesce(v_role, '') not in ('administracion', 'operador') then raise exception 'Sin permiso para cargar el costo del tercerizado' using errcode = '42501'; end if;
  select * into s from public.operator_services where service_id = p_service_id;
  if not found then raise exception 'El servicio no existe'; end if;
  select * into v_old from public.outsourced_service_costs where service_id = p_service_id for update;
  v_has_old := found;
  if v_has_old and v_old.settlement_id is not null then raise exception 'Este servicio ya está en una liquidación del tercerizado: no se puede cambiar lo que se le paga'; end if;
  -- El ajuste es plata: sólo Administración lo cambia. Si guarda el operador, queda el que había.
  if v_role <> 'administracion' then
    p := (p - 'adjustment_amount' - 'adjustment_reason') || jsonb_build_object(
      'adjustment_amount', case when v_has_old then coalesce(v_old.adjustment_amount, 0) else 0 end,
      'adjustment_reason', case when v_has_old then v_old.adjustment_reason end);
  end if;
  v_reason := nullif(btrim(coalesce(p->>'adjustment_reason', '')), '');

  if nullif(p->>'provider_id', '') is null or coalesce(s.logistics_type, 'own') <> 'third_party' then
    if v_has_old then
      update public.outsourced_service_costs set provider_id = null, version_id = null, rate_snapshot = null, breakdown = '[]'::jsonb,
        base_amount = 0, extras_amount = 0, tolls_payable = 0, adjustment_amount = 0, adjustment_reason = null, total_amount = 0,
        updated_at = now(), updated_by = auth.uid()
      where service_id = p_service_id returning * into v_row;
      return case when v_role = 'administracion' then to_jsonb(v_row) else app_private.outsourced_hide_amounts(to_jsonb(v_row)) end;
    end if;
    return null;
  end if;

  q := app_private.outsourced_quote(p || jsonb_build_object('concept_id', s.primary_concept_id,
         'date', (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date));
  if q ? 'error' then raise exception '%', q->>'error'; end if;
  if (q->>'adjustment_amount')::numeric <> 0 and char_length(coalesce(v_reason, '')) < 5 then raise exception 'Contá el motivo del ajuste (al menos 5 letras)'; end if;

  insert into public.outsourced_service_costs as c (service_id, provider_id, version_id, concept_id, service_date, rate_snapshot,
    km_asphalt, km_gravel, tolls_amount, extras, breakdown, base_amount, extras_amount, tolls_payable, adjustment_amount, adjustment_reason,
    total_amount, created_by, updated_by)
  values (p_service_id, (q->>'provider_id')::uuid, (q->>'version_id')::uuid, (q->>'concept_id')::uuid, (q->>'date')::date, q->'rate_snapshot',
    (q->>'km_asphalt')::numeric, (q->>'km_gravel')::numeric, (q->>'tolls_amount')::numeric, q->'extras', q->'breakdown',
    (q->>'base_amount')::numeric, (q->>'extras_amount')::numeric, (q->>'tolls_payable')::numeric, (q->>'adjustment_amount')::numeric,
    case when (q->>'adjustment_amount')::numeric <> 0 then v_reason end, (q->>'total_amount')::numeric, auth.uid(), auth.uid())
  on conflict (service_id) do update set provider_id = excluded.provider_id, version_id = excluded.version_id, concept_id = excluded.concept_id,
    service_date = excluded.service_date, rate_snapshot = excluded.rate_snapshot, km_asphalt = excluded.km_asphalt, km_gravel = excluded.km_gravel,
    tolls_amount = excluded.tolls_amount, extras = excluded.extras, breakdown = excluded.breakdown, base_amount = excluded.base_amount,
    extras_amount = excluded.extras_amount, tolls_payable = excluded.tolls_payable, adjustment_amount = excluded.adjustment_amount,
    adjustment_reason = excluded.adjustment_reason, total_amount = excluded.total_amount, updated_at = now(), updated_by = auth.uid()
  returning * into v_row;
  return case when v_role = 'administracion' then to_jsonb(v_row) else app_private.outsourced_hide_amounts(to_jsonb(v_row)) end;
end $function$;
revoke all on function public.set_outsourced_service_cost_v1(uuid, jsonb) from public, anon;
grant execute on function public.set_outsourced_service_cost_v1(uuid, jsonb) to authenticated;
