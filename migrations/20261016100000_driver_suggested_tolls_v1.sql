-- Peajes sugeridos para el chofer · 16/10/2026
-- 1) El servicio guarda el trazado del recorrido que calculó Operaciones (polilínea de Google).
-- 2) La referencia del remito le manda al chofer el trazado, la ubicación de cada peaje y los peajes que ya cargó
--    Operaciones, para marcar como "Sugerido" los que quedan sobre el recorrido.
-- 3) El chofer también puede cargar el peaje "Manual / Varios" (sin peaje del catálogo, importe a mano).
alter table public.operator_services add column if not exists route_polyline text;

create or replace function public.set_operator_service_route_v1(p_service_id uuid, p_polyline text)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare v_role text:=coalesce(app_private.current_auxilios_role(),''); v_poly text:=nullif(btrim(coalesce(p_polyline,'')),'');
begin
  if auth.uid() is null or v_role not in ('administracion','operador') then raise exception 'Sin permiso para guardar el recorrido'; end if;
  if v_poly is not null and length(v_poly)>200000 then raise exception 'El trazado del recorrido es demasiado largo'; end if;
  update public.operator_services set route_polyline=v_poly where service_id=p_service_id and route_polyline is distinct from v_poly;
  return jsonb_build_object('service_id',p_service_id,'saved',v_poly is not null);
end $function$;
revoke all on function public.set_operator_service_route_v1(uuid,text) from public, anon;
grant execute on function public.set_operator_service_route_v1(uuid,text) to authenticated;

do $$
declare d text:=pg_get_functiondef('public.get_driver_remito_reference_v2(uuid)'::regprocedure); n text;
begin
  n:=replace(d,$a$'toll_id',l.toll_id,'code',l.code,'name',l.name,'road',l.road,'direction',l.direction,$a$,
    $a$'toll_id',l.toll_id,'code',l.code,'name',l.name,'road',l.road,'direction',l.direction,'latitude',l.latitude,'longitude',l.longitude,$a$);
  n:=replace(n,$a$'tolls',v_tolls,'excess_concepts',v_concepts,$a$,
    $a$'tolls',v_tolls,'excess_concepts',v_concepts,
    'route_polyline',case when p_service_id is null then null else (select s.route_polyline from public.operator_services s where s.service_id=p_service_id) end,
    'planned_toll_ids',case when p_service_id is null then '[]'::jsonb else coalesce((select jsonb_agg(distinct t.toll_id) from public.operator_service_tolls t where t.service_id=p_service_id and t.toll_id is not null and t.source in ('planned','manual')),'[]'::jsonb) end,
    'manual_toll',true,$a$);
  if n=d or position('''route_polyline''' in n)=0 or position('''latitude'',l.latitude' in n)=0 then raise exception 'No se pudo parchear get_driver_remito_reference_v2'; end if;
  execute n;
end $$;

do $$
declare d text:=pg_get_functiondef('app_private.persist_driver_remito_addons_v3(integer,jsonb,uuid)'::regprocedure); n text;
begin
  n:=replace(d,$a$    if v_toll_id is null then raise exception 'Seleccioná un peaje habilitado'; end if;$a$,
    $a$    if v_toll_id is null and not coalesce(nullif(v_row->>'manual','')::boolean,false) then raise exception 'Seleccioná un peaje habilitado'; end if;$a$);
  n:=replace(n,$a$    select * into v_toll from public.toll_locations where toll_id=v_toll_id and is_active;
    if not found then raise exception 'Uno de los peajes ya no está activo'; end if;$a$,
    $a$    if v_toll_id is null then
      -- Manual / Varios: el chofer no sabe por cuál pasó y carga el importe a mano.
      v_toll:=null; v_toll.code:='MANUAL'; v_toll.name:='Manual / Varios';
    else
      select * into v_toll from public.toll_locations where toll_id=v_toll_id and is_active;
      if not found then raise exception 'Uno de los peajes ya no está activo'; end if;
    end if;$a$);
  if n=d or position('Manual / Varios' in n)=0 or position('v_row->>''manual''' in n)=0 then raise exception 'No se pudo parchear persist_driver_remito_addons_v3'; end if;
  execute n;
end $$;
