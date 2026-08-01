create or replace function public.list_operator_services(p_limit integer default 300)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_role text := app_private.current_auxilios_role();
  v_uid uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit,300),1),1000);
  v_result jsonb;
begin
  if v_role in ('administracion','supervision') then
    select coalesce(jsonb_agg(row_data order by scheduled_for desc),'[]'::jsonb)
    into v_result
    from (
      select s.scheduled_for,
             to_jsonb(s)
             || jsonb_build_object(
                  'company_name',coalesce(c.trade_name,c.legal_name),
                  'branch_name',b.name,
                  'concept_name',sc.name,
                  'concept_icon',sc.icon,
                  'driver_name',du.full_name,
                  'truck_label',coalesce(t.numero_interno,t.plate)
                ) as row_data
      from public.operator_services s
      join public.companies c on c.company_id=s.company_id
      left join public.company_branches b on b.branch_id=s.branch_id
      left join public.service_concepts sc on sc.concept_id=s.primary_concept_id
      left join public.users du on du.user_id=s.assigned_driver_id
      left join public.trucks t on t.truck_id=s.assigned_truck_id
      order by s.scheduled_for desc
      limit v_limit
    ) q;
  elsif v_role='chofer' then
    select coalesce(jsonb_agg(row_data order by scheduled_for desc),'[]'::jsonb)
    into v_result
    from (
      select s.scheduled_for,
             jsonb_build_object(
               'service_id',s.service_id,
               'service_number',s.service_number,
               'status',s.status,
               'priority',s.priority,
               'company_id',s.company_id,
               'company_name',coalesce(c.trade_name,c.legal_name),
               'branch_id',s.branch_id,
               'branch_name',b.name,
               'service_order_number',s.service_order_number,
               'requested_at',s.requested_at,
               'scheduled_for',s.scheduled_for,
               'estimated_arrival_at',s.estimated_arrival_at,
               'customer_name',s.customer_name,
               'customer_phone',s.customer_phone,
               'customer_email',s.customer_email,
               'vehicle_plate',s.vehicle_plate,
               'vehicle_make_model',s.vehicle_make_model,
               'origin',s.origin,
               'destination',s.destination,
               'primary_concept_id',s.primary_concept_id,
               'concept_name',sc.name,
               'concept_icon',sc.icon,
               'assigned_driver_id',s.assigned_driver_id,
               'assigned_truck_id',s.assigned_truck_id,
               'assigned_at',s.assigned_at,
               'truck_label',coalesce(t.numero_interno,t.plate),
               'driver_instructions',s.driver_instructions,
               'driver_notes',s.driver_notes,
               'completed_at',s.completed_at,
               'cancelled_at',s.cancelled_at,
               'created_at',s.created_at,
               'updated_at',s.updated_at
             ) as row_data
      from public.operator_services s
      join public.companies c on c.company_id=s.company_id
      left join public.company_branches b on b.branch_id=s.branch_id
      left join public.service_concepts sc on sc.concept_id=s.primary_concept_id
      left join public.trucks t on t.truck_id=s.assigned_truck_id
      where s.assigned_driver_id=v_uid
      order by s.scheduled_for desc
      limit v_limit
    ) q;
  else
    raise exception 'Sin permiso para consultar servicios';
  end if;
  return v_result;
end;
$$;

create or replace function public.get_operator_service_detail(p_service_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_role text := app_private.current_auxilios_role();
  v_uid uuid := auth.uid();
  v_service public.operator_services%rowtype;
  v_company_name text;
  v_branch_name text;
  v_concept_name text;
  v_concept_icon text;
  v_driver_name text;
  v_truck_label text;
  v_items jsonb;
  v_events jsonb;
  v_service_json jsonb;
begin
  select s.* into v_service
  from public.operator_services s
  where s.service_id=p_service_id;
  if not found then raise exception 'Servicio inexistente'; end if;
  if v_role not in ('administracion','supervision') and not (v_role='chofer' and v_service.assigned_driver_id=v_uid) then
    raise exception 'Sin permiso para consultar el servicio';
  end if;

  select coalesce(c.trade_name,c.legal_name) into v_company_name
  from public.companies c where c.company_id=v_service.company_id;
  select b.name into v_branch_name
  from public.company_branches b where b.branch_id=v_service.branch_id;
  select sc.name,sc.icon into v_concept_name,v_concept_icon
  from public.service_concepts sc where sc.concept_id=v_service.primary_concept_id;
  select u.full_name into v_driver_name
  from public.users u where u.user_id=v_service.assigned_driver_id;
  select coalesce(t.numero_interno,t.plate) into v_truck_label
  from public.trucks t where t.truck_id=v_service.assigned_truck_id;

  if v_role in ('administracion','supervision') then
    v_service_json:=to_jsonb(v_service)||jsonb_build_object(
      'company_name',v_company_name,'branch_name',v_branch_name,
      'concept_name',v_concept_name,'concept_icon',v_concept_icon,
      'driver_name',v_driver_name,'truck_label',v_truck_label
    );
    select coalesce(jsonb_agg(to_jsonb(i) order by i.sort_order,i.created_at),'[]'::jsonb)
      into v_items from public.operator_service_items i where i.service_id=p_service_id;
  else
    v_service_json:=jsonb_build_object(
      'service_id',v_service.service_id,
      'service_number',v_service.service_number,
      'status',v_service.status,
      'priority',v_service.priority,
      'company_id',v_service.company_id,
      'company_name',v_company_name,
      'branch_id',v_service.branch_id,
      'branch_name',v_branch_name,
      'service_order_number',v_service.service_order_number,
      'requested_at',v_service.requested_at,
      'scheduled_for',v_service.scheduled_for,
      'estimated_arrival_at',v_service.estimated_arrival_at,
      'customer_name',v_service.customer_name,
      'customer_phone',v_service.customer_phone,
      'customer_email',v_service.customer_email,
      'vehicle_plate',v_service.vehicle_plate,
      'vehicle_make_model',v_service.vehicle_make_model,
      'origin',v_service.origin,
      'destination',v_service.destination,
      'primary_concept_id',v_service.primary_concept_id,
      'concept_name',v_concept_name,
      'concept_icon',v_concept_icon,
      'assigned_driver_id',v_service.assigned_driver_id,
      'assigned_truck_id',v_service.assigned_truck_id,
      'assigned_at',v_service.assigned_at,
      'driver_name',v_driver_name,
      'truck_label',v_truck_label,
      'driver_instructions',v_service.driver_instructions,
      'driver_notes',v_service.driver_notes,
      'completed_at',v_service.completed_at,
      'cancelled_at',v_service.cancelled_at,
      'created_at',v_service.created_at,
      'updated_at',v_service.updated_at
    );
    select coalesce(jsonb_agg(jsonb_build_object(
      'item_id',i.item_id,'item_role',i.item_role,'service_code',i.service_code,
      'service_name',i.service_name,'pricing_unit',i.pricing_unit,'quantity',i.quantity,
      'sort_order',i.sort_order
    ) order by i.sort_order,i.created_at),'[]'::jsonb)
      into v_items from public.operator_service_items i where i.service_id=p_service_id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'event_id',e.event_id,'event_type',e.event_type,'from_status',e.from_status,
    'to_status',e.to_status,'notes',e.notes,'created_at',e.created_at
  ) order by e.created_at desc),'[]'::jsonb)
    into v_events from public.operator_service_events e where e.service_id=p_service_id;

  return jsonb_build_object('service',v_service_json,'items',v_items,'events',v_events);
end;
$$;

revoke all on function public.list_operator_services(integer) from public,anon;
revoke all on function public.get_operator_service_detail(uuid) from public,anon;
grant execute on function public.list_operator_services(integer) to authenticated;
grant execute on function public.get_operator_service_detail(uuid) to authenticated;

revoke select on public.operator_services,public.operator_service_items,public.operator_service_events from authenticated;
grant select(service_id) on public.operator_services to authenticated;
