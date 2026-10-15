-- Servicios activados (15/10/2026)
-- · Un activado siempre se factura. Si no corresponde cobrarlo, se anula.
-- · Al finalizarlo se elige el tipo:
--     origin   = Activado Origen: llegó al origen; km Base → Origen → Base.
--     movement = Activado Movida: estaba en camino; km cargados a mano.
--   Esos km reemplazan los km del servicio y el precio se recalcula.
alter table public.operator_services
  add column if not exists activation_kind text check (activation_kind in ('origin','movement')),
  add column if not exists activation_km numeric check (activation_km is null or activation_km >= 0);

-- Puntos para calcular el recorrido Base → Origen → Base de un activado
create or replace function public.get_activation_route_points_v1(p_service_id uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $f$
declare s public.operator_services%rowtype; b public.billing_bases%rowtype;
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'') not in ('operador','administracion') then
    raise exception 'Sin permiso para consultar el recorrido';
  end if;
  select * into s from public.operator_services where service_id=p_service_id;
  if not found then raise exception 'Servicio inexistente'; end if;
  select * into b from public.billing_bases where base_id=s.billing_base_id;
  return jsonb_build_object(
    'service_id',s.service_id,
    'base',jsonb_build_object('name',coalesce(b.name,s.billing_snapshot#>>'{base,name}'),
      'latitude',coalesce(b.latitude,(s.billing_snapshot#>>'{base,latitude}')::numeric),
      'longitude',coalesce(b.longitude,(s.billing_snapshot#>>'{base,longitude}')::numeric)),
    'origin',jsonb_build_object('address',coalesce(s.origin_formatted_address,s.origin),'latitude',s.origin_lat,'longitude',s.origin_lng),
    'current_km',coalesce(s.estimated_asphalt_km,0)+coalesce(s.estimated_gravel_km,0));
end $f$;
revoke all on function public.get_activation_route_points_v1(uuid) from public, anon;
grant execute on function public.get_activation_route_points_v1(uuid) to authenticated;

do $p$ declare d text; n text; begin
  -- 1) Finalizar un activado: siempre facturable
  d := pg_get_functiondef('public.finalize_activated_service_v1(uuid,boolean,text)'::regprocedure);
  n := replace(d, E' if p_billable is null then raise exception ''Elegí Facturable o No facturable''; end if;\n if not p_billable and nullif(btrim(p_reason),'''') is null then raise exception ''Indicá el motivo por el que no se factura''; end if;\n',
    E' if p_billable is distinct from true then raise exception ''Un servicio activado siempre se factura. Si no corresponde cobrarlo, anulalo.''; end if;\n');
  if n = d then raise exception 'parche: finalize_activated_service_v1'; end if;
  execute n;

  -- 2) Cierre con hora de fin: aplica el tipo de activado y sus km antes de finalizar
  d := pg_get_functiondef('public.finalize_operator_service_at_v1(uuid,timestamptz,text,jsonb)'::regprocedure);
  n := replace(d, E' ELSIF p_mode=''activated'' THEN\n  result:=public.finalize_activated_service_v1(',
    E' ELSIF p_mode=''activated'' THEN\n  IF p_payload ? ''activation_kind'' THEN\n   IF p_payload->>''activation_kind'' NOT IN (''origin'',''movement'') THEN RAISE EXCEPTION ''Elegí Activado Origen o Activado Movida''; END IF;\n   IF nullif(p_payload->>''activation_km'','''') IS NULL OR (p_payload->>''activation_km'')::numeric<0 THEN RAISE EXCEPTION ''Indicá los kilómetros del activado''; END IF;\n   PERFORM app_private.update_operator_service_administrative_core_v1(p_service_id,\n     jsonb_build_object(''estimated_asphalt_km'',(p_payload->>''activation_km'')::numeric,''estimated_gravel_km'',0),\n     CASE p_payload->>''activation_kind'' WHEN ''origin'' THEN ''Activado Origen: km Base → Origen → Base'' ELSE ''Activado Movida: km cargados por el operador'' END);\n   UPDATE public.operator_services SET activation_kind=p_payload->>''activation_kind'',activation_km=(p_payload->>''activation_km'')::numeric WHERE service_id=p_service_id;\n  END IF;\n  result:=public.finalize_activated_service_v1(');
  if n = d then raise exception 'parche: finalize_operator_service_at_v1'; end if;
  execute n;

  -- 3) Activado que viene de un ingreso del chofer: siempre facturable y guarda el tipo
  d := pg_get_functiondef('public.create_finalize_activated_intake_v1(uuid,jsonb,boolean,text)'::regprocedure);
  n := replace(d, E' if p_billable is null then raise exception ''Elegí Facturable o No facturable''; end if;\n if not p_billable and nullif(btrim(p_reason),'''') is null then raise exception ''Indicá el motivo por el que no se factura''; end if;\n',
    E' if p_billable is distinct from true then raise exception ''Un servicio activado siempre se factura. Si no corresponde cobrarlo, anulalo.''; end if;\n if coalesce(p_payload->>''activation_kind'',''origin'') not in (''origin'',''movement'') then raise exception ''Elegí Activado Origen o Activado Movida''; end if;\n');
  n := replace(n, E'-''administrative_commercial''-''administrative_revision'');',
    E'-''administrative_commercial''-''administrative_revision''-''activation_kind'');');
  n := replace(n, E'trip_id=i.trip_id,remito_id=i.remito_id,document_status=''not_started'',service_origin=''driver_ad_hoc''\n where service_id=sid;',
    E'trip_id=i.trip_id,remito_id=i.remito_id,document_status=''not_started'',service_origin=''driver_ad_hoc'',\n activation_kind=nullif(p_payload->>''activation_kind'',''''),activation_km=coalesce(estimated_asphalt_km,0)+coalesce(estimated_gravel_km,0)\n where service_id=sid;');
  if position('siempre se factura' in n)=0 or position('-''activation_kind'')' in n)=0 or position('activation_km=coalesce(estimated_asphalt_km' in n)=0 then
    raise exception 'parche: create_finalize_activated_intake_v1';
  end if;
  execute n;
end $p$;
