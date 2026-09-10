-- Hotfix productivo: una sola fuente para bloquear moviles con jornada abierta.

begin;

create or replace function public.get_driver_truck_availability_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
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
  left join public.users u on u.user_id = open_log.driver_id
  where t.status = 'active';

  return v_result;
end;
$$;

revoke all on function public.get_driver_truck_availability_v1() from public, anon;
grant execute on function public.get_driver_truck_availability_v1() to authenticated;

comment on function public.get_driver_truck_availability_v1() is
  'Disponibilidad canonica de moviles para el selector del chofer; una jornada open bloquea el movil sin importar su fecha.';

commit;
