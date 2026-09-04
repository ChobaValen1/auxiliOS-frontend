-- AuxiliOS · resumen operativo de KM, excedentes y peajes para el Chofer.

create or replace function public.get_driver_operator_queue_v2()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role text:=app_private.current_auxilios_role();
  v_uid uuid:=auth.uid();
  v_result jsonb;
begin
  if v_role<>'chofer' or v_uid is null then
    raise exception 'Solo los choferes pueden consultar esta cola';
  end if;

  select coalesce(jsonb_agg(row_data order by scheduled_for,created_at),'[]'::jsonb)
  into v_result
  from (
    select s.scheduled_for,s.created_at,jsonb_build_object(
      'service_id',s.service_id,
      'service_number',s.service_number,
      'service_order_number',s.service_order_number,
      'status',s.status,
      'priority',s.priority,
      'scheduled_for',s.scheduled_for,
      'company_name',coalesce(c.trade_name,c.legal_name),
      'concept_name',sc.name,
      'concept_icon',sc.icon,
      'customer_name',s.customer_name,
      'customer_phone',s.customer_phone,
      'vehicle_plate',s.vehicle_plate,
      'vehicle_make_model',s.vehicle_make_model,
      'origin',s.origin,
      'destination',s.destination,
      'origin_destination_distance_meters',case
        when s.route_provider='google_routes'
          and s.billing_snapshot->>'route_mode'='origin_destination'
          then coalesce(nullif(s.route_legs->0->>'distanceMeters','')::integer,s.route_distance_meters)
        when s.route_provider='google_routes'
          and s.billing_snapshot->>'route_mode'='base_origin_destination_base'
          then nullif(s.route_legs->1->>'distanceMeters','')::integer
        else null
      end,
      'origin_destination_distance_provider',case
        when s.route_provider='google_routes'
          and s.billing_snapshot->>'route_mode' in ('origin_destination','base_origin_destination_base')
          then 'google_routes'
        else null
      end,
      'toll_payment_summary',coalesce(toll_summary.payment_summary,'Sin peajes previstos'),
      'toll_charge_summary',jsonb_build_object(
        'groups',coalesce(toll_summary.groups,'[]'::jsonb),
        'total_amount',coalesce(toll_summary.total_amount,0)
      ),
      'has_excesses',(
        exists(select 1 from public.operator_service_excess_charges e where e.service_id=s.service_id)
        or exists(select 1 from public.remito_excess_reports x where x.remito_id=s.remito_id)
      ),
      'customer_amount_due',coalesce(excess_summary.total_amount,0),
      'customer_payment_methods',coalesce(excess_summary.payment_methods,array[]::text[]),
      'customer_excess_summary',jsonb_build_object(
        'total_amount',coalesce(excess_summary.total_amount,0),
        'count',coalesce(excess_summary.line_count,0),
        'payment_methods',coalesce(excess_summary.payment_methods,array[]::text[]),
        'items',coalesce(excess_summary.items,'[]'::jsonb)
      ),
      'driver_instructions',s.driver_instructions,
      'assigned_truck_id',s.assigned_truck_id,
      'truck_label',coalesce(t.numero_interno,t.plate),
      'trip_id',s.trip_id,
      'remito_id',s.remito_id,
      'remito_number',r.nro_remito,
      'remito_status',r.status,
      'arrived_at',s.arrived_at,
      'can_complete_remito',s.status='assigned'
    ) row_data
    from public.operator_services s
    join public.companies c on c.company_id=s.company_id
    left join public.service_concepts sc on sc.concept_id=s.primary_concept_id
    left join public.trucks t on t.truck_id=s.assigned_truck_id
    left join public.remitos r on r.remito_id=s.remito_id
    left join lateral (
      with source_choice as (
        select exists(
          select 1 from public.operator_service_tolls actual
          where actual.service_id=s.service_id and actual.source='actual'
        ) as has_actual
      ), effective_tolls as (
        select coalesce(toll.payer_agent,'provider') payer_agent,
          toll.toll_name_snapshot,
          toll.total_amount,
          toll.provider_unit_amount,
          toll.customer_unit_amount,
          toll.quantity,
          toll.customer_payment_method,
          toll.created_at
        from public.operator_service_tolls toll
        cross join source_choice choice
        where toll.service_id=s.service_id
          and (
            (choice.has_actual and toll.source='actual')
            or (not choice.has_actual and toll.source in ('planned','manual'))
          )
      ), grouped as (
        select key,label,sum(amount) total_amount,count(*) toll_count,jsonb_agg(
          jsonb_build_object('toll_name',toll_name_snapshot,'amount',amount)
          order by created_at
        ) items
        from (
          select case
              when payer_agent='customer' then 'customer'
              when payer_agent='both' then 'mixed'
              else 'provider'
            end key,
            case
              when payer_agent='customer' then 'A cargo del socio'
              when payer_agent='both' then 'Mixto'
              else 'A cargo de la prestadora'
            end label,
            toll_name_snapshot,
            case
              when payer_agent='customer' then coalesce(total_amount,0)
              when payer_agent='both' then coalesce(customer_unit_amount,0)*coalesce(quantity,1)
              else coalesce(total_amount,0)
            end amount,
            created_at
          from effective_tolls
        ) classified
        where amount > 0
        group by key,label
      ), payment_data as (
        select count(*) toll_count,
          bool_and(payer_agent='provider') provider_only,
          bool_and(payer_agent='customer') customer_only,
          string_agg(distinct case customer_payment_method
            when 'cash' then 'Efectivo'
            when 'transfer' then 'Transferencia'
            when 'card' then 'Tarjeta'
            when 'mercado_pago' then 'Mercado Pago'
            when 'electronic' then 'Electrónico'
            when 'telepass' then 'TelePASE'
            when 'manual' then 'Manual'
            when 'other' then 'Otro'
            when 'not_collected' then 'No cobrado'
          end,' / ') filter(
            where payer_agent in ('customer','both') and customer_payment_method is not null
          ) customer_methods
        from effective_tolls
      )
      select case
          when payment_data.toll_count=0 then 'Sin peajes previstos'
          when provider_only then 'A cargo de la prestadora'
          when customer_only then 'A cargo del socio'||case
            when customer_methods is null then '' else ' · '||customer_methods end
          else 'Pago mixto'||case
            when customer_methods is null then '' else ' · Socio: '||customer_methods end
        end payment_summary,
        coalesce((select sum(total_amount) from grouped),0) total_amount,
        coalesce((select jsonb_agg(jsonb_build_object(
          'key',key,
          'label',label,
          'total_amount',total_amount,
          'count',toll_count,
          'items',items
        ) order by case key when 'customer' then 1 when 'provider' then 2 else 3 end) from grouped),'[]'::jsonb) groups
      from payment_data
    ) toll_summary on true
    left join lateral (
      with source_choice as (
        select exists(
          select 1 from public.operator_service_excess_charges actual
          where actual.service_id=s.service_id and actual.source='actual'
        ) as has_actual
      ), effective_excesses as (
        select e.concept_name_snapshot,
          e.total_amount,
          e.customer_payment_method,
          e.created_at
        from public.operator_service_excess_charges e
        cross join source_choice choice
        where e.service_id=s.service_id
          and (
            (choice.has_actual and e.source='actual')
            or (not choice.has_actual and e.source in ('planned','manual'))
          )
          and (
            coalesce(e.payer_agent,'customer')='customer'
            or e.collector_agent='company'
            or e.customer_payment_method is not null
          )
      )
      select coalesce(sum(total_amount),0) total_amount,
        count(*) line_count,
        coalesce(
          array_agg(distinct customer_payment_method order by customer_payment_method)
            filter (where customer_payment_method is not null),
          array[]::text[]
        ) payment_methods,
        coalesce(jsonb_agg(
          jsonb_build_object(
            'concept_name',concept_name_snapshot,
            'total_amount',total_amount,
            'customer_payment_method',customer_payment_method
          )
          order by created_at
        ),'[]'::jsonb) items
      from effective_excesses
    ) excess_summary on true
    where s.assigned_driver_id=v_uid
      and s.status in ('assigned','at_origin')
    order by s.scheduled_for,s.created_at
    limit 20
  ) q;

  return v_result;
end;
$function$;

comment on function public.get_driver_operator_queue_v2() is
  'Cola privada del Chofer con KM origen-destino, excedentes del socio y peajes agrupados por responsable.';

revoke all on function public.get_driver_operator_queue_v2() from public,anon,authenticated;
grant execute on function public.get_driver_operator_queue_v2() to authenticated;
