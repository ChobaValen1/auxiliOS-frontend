-- Planes de service base por tipo de camión (plancha, asistencia, pesado…).
--
-- truck_type_plans guarda qué planes del catálogo (master_service_plans) lleva
-- cada tipo de camión. set_truck_type_plans_v1 (sólo Administración) guarda la
-- lista del tipo y se la asigna a todos sus móviles de una vez: suscribe los
-- que faltan y reactiva los dados de baja. Sacar un plan de la lista base no se
-- lo quita a los móviles que ya lo tienen (eso se hace desde cada móvil).
-- Un móvil nuevo, o uno al que se le cambia el tipo, recibe los planes base.

create table if not exists public.truck_type_plans (
  tipo_equipo text not null check (btrim(tipo_equipo) <> ''),
  master_plan_id bigint not null references public.master_service_plans(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  primary key (tipo_equipo, master_plan_id)
);
alter table public.truck_type_plans enable row level security;
drop policy if exists truck_type_plans_read on public.truck_type_plans;
create policy truck_type_plans_read on public.truck_type_plans for select to authenticated
  using (coalesce(app_private.current_auxilios_role(), '') in ('administracion', 'supervision'));
revoke insert, update, delete, truncate on public.truck_type_plans from anon, authenticated;

-- Suscribe un móvil a los planes base de su tipo. Sin nextval de más: sólo inserta lo que falta.
create or replace function app_private.apply_truck_type_plans_v1(p_truck_id integer)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_tipo text; v_n integer := 0; v_r integer;
begin
  select t.tipo_equipo into v_tipo from public.trucks t
   where t.truck_id = p_truck_id and not coalesce(t.is_test, false) and coalesce(t.status, 'active') <> 'inactive';
  if v_tipo is null then return 0; end if;
  update public.truck_subscriptions s set is_active = true
    from public.truck_type_plans b
   where b.tipo_equipo = v_tipo and s.truck_id = p_truck_id and s.master_plan_id = b.master_plan_id
     and s.is_active is distinct from true;
  get diagnostics v_r = row_count; v_n := v_n + v_r;
  insert into public.truck_subscriptions (truck_id, master_plan_id, is_active)
  select p_truck_id, b.master_plan_id, true
    from public.truck_type_plans b
    join public.master_service_plans m on m.id = b.master_plan_id and coalesce(m.activo, true)
   where b.tipo_equipo = v_tipo
     and not exists (select 1 from public.truck_subscriptions s where s.truck_id = p_truck_id and s.master_plan_id = b.master_plan_id);
  get diagnostics v_r = row_count; v_n := v_n + v_r;
  return v_n;
end
$function$;
revoke all on function app_private.apply_truck_type_plans_v1(integer) from public, anon, authenticated;

create or replace function app_private.trg_truck_type_plans_v1()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if tg_op = 'INSERT' or new.tipo_equipo is distinct from old.tipo_equipo then
    perform app_private.apply_truck_type_plans_v1(new.truck_id);
  end if;
  return null;
end
$function$;
revoke all on function app_private.trg_truck_type_plans_v1() from public, anon, authenticated;
drop trigger if exists trg_truck_type_plans on public.trucks;
create trigger trg_truck_type_plans after insert or update of tipo_equipo on public.trucks
  for each row execute function app_private.trg_truck_type_plans_v1();

-- Tipos de camión, planes base de cada uno y cuántos móviles del tipo tienen cada plan.
create or replace function public.get_truck_type_plans_v1()
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(), '') not in ('administracion', 'supervision') then
    raise exception 'Sin permiso para ver los planes base';
  end if;
  return jsonb_build_object(
    'tipos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tipo', x.tipo,
        'moviles', (select count(*) from public.trucks t where t.tipo_equipo = x.tipo and not coalesce(t.is_test, false) and coalesce(t.status, 'active') <> 'inactive'),
        'planes', coalesce((select jsonb_agg(b.master_plan_id order by b.master_plan_id) from public.truck_type_plans b where b.tipo_equipo = x.tipo), '[]'::jsonb),
        'cobertura', coalesce((
          select jsonb_object_agg(c.master_plan_id::text, c.n) from (
            select s.master_plan_id, count(*) n from public.truck_subscriptions s
              join public.trucks t on t.truck_id = s.truck_id
             where t.tipo_equipo = x.tipo and s.is_active and not coalesce(t.is_test, false) and coalesce(t.status, 'active') <> 'inactive'
             group by s.master_plan_id) c), '{}'::jsonb)
      ) order by x.tipo)
      from (select distinct t.tipo_equipo tipo from public.trucks t where t.tipo_equipo is not null and not coalesce(t.is_test, false)
            union select b.tipo_equipo from public.truck_type_plans b) x), '[]'::jsonb),
    'catalogo', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'trigger_type', m.trigger_type,
        'interval_km', m.interval_km, 'interval_hours', m.interval_hours) order by m.name)
        from public.master_service_plans m where coalesce(m.activo, true)), '[]'::jsonb));
end
$function$;
revoke all on function public.get_truck_type_plans_v1() from public, anon;
grant execute on function public.get_truck_type_plans_v1() to authenticated;

-- Guarda los planes base de un tipo y se los asigna a todos sus móviles.
create or replace function public.set_truck_type_plans_v1(p_tipo text, p_plan_ids bigint[])
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_tipo text := nullif(btrim(coalesce(p_tipo, '')), ''); v_ids bigint[] := coalesce(p_plan_ids, '{}'); v_n integer := 0; v_m integer := 0; v_t record;
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(), '') <> 'administracion' then
    raise exception 'Sólo Administración puede cambiar los planes base';
  end if;
  if v_tipo is null or not exists (select 1 from public.trucks t where t.tipo_equipo = v_tipo) then
    raise exception 'Tipo de camión desconocido';
  end if;
  if exists (select 1 from unnest(v_ids) i where not exists (select 1 from public.master_service_plans m where m.id = i and coalesce(m.activo, true))) then
    raise exception 'Hay planes que no están en el catálogo activo';
  end if;

  delete from public.truck_type_plans where tipo_equipo = v_tipo and not (master_plan_id = any(v_ids));
  insert into public.truck_type_plans (tipo_equipo, master_plan_id)
  select v_tipo, i from (select distinct unnest(v_ids) i) u
   where not exists (select 1 from public.truck_type_plans b where b.tipo_equipo = v_tipo and b.master_plan_id = u.i);

  for v_t in select t.truck_id from public.trucks t
              where t.tipo_equipo = v_tipo and not coalesce(t.is_test, false) and coalesce(t.status, 'active') <> 'inactive' loop
    v_m := v_m + 1;
    v_n := v_n + app_private.apply_truck_type_plans_v1(v_t.truck_id);
  end loop;
  return jsonb_build_object('tipo', v_tipo, 'planes', coalesce(array_length(v_ids, 1), 0), 'moviles', v_m, 'asignados', v_n);
end
$function$;
revoke all on function public.set_truck_type_plans_v1(text, bigint[]) from public, anon;
grant execute on function public.set_truck_type_plans_v1(text, bigint[]) to authenticated;
