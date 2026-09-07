-- Integration against the deployed RPCs/triggers. ALWAYS run as one transaction.
-- Creates only synthetic users/resources/documents, and rolls everything back.
-- No Auth users, real signatures, storage writes, or real services are modified.
-- Sequence values may have gaps after rollback, as with any aborted insert.
-- The three contract IDs below are read-only fixture prerequisites on this project.
begin;
do $test$
declare
  v_driver uuid:=gen_random_uuid(); v_operator uuid:=gen_random_uuid();
  v_operation uuid:=gen_random_uuid(); v_suffix text:=left(replace(gen_random_uuid()::text,'-',''),10);
  v_truck integer:=-2060907001; v_log integer:=-2060907001;
  v_toll uuid; v_excess uuid; v_payload jsonb; v_result jsonb; v_context jsonb; v_created jsonb; v_replay jsonb;
  v_intake uuid; v_remito integer; v_service uuid; v_row public.operator_services%rowtype;
begin
  if exists(select 1 from public.trucks where truck_id=v_truck)
    or exists(select 1 from public.daily_logs where log_id=v_log) then raise exception 'QA fixture IDs occupied'; end if;
  insert into public.users(user_id,role_id,legajo,email,password_hash,full_name,is_test)
    values(v_driver,(select role_id from public.roles where name='chofer'),'QAD'||v_suffix,v_driver||'@example.invalid','DISABLED-QA-NO-AUTH-ACCOUNT','QA transactional driver',true),
      (v_operator,(select role_id from public.roles where name='operador'),'QAO'||v_suffix,v_operator||'@example.invalid','DISABLED-QA-NO-AUTH-ACCOUNT','QA transactional operator',true);
  insert into public.trucks(truck_id,plate,numero_interno,is_test,assigned_to)
    values(v_truck,'QA'||left(v_suffix,8),'QA handoff',true,v_driver);
  perform set_config('request.jwt.claim.sub',v_driver::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_driver,'role','authenticated')::text,true);
  insert into public.daily_logs(log_id,driver_id,truck_id,km_inicio,km_inicio_origen)
    values(v_log,v_driver,v_truck,0,'ia');
  select toll_id into v_toll from public.toll_locations where is_active order by toll_id limit 1;
  select concept_id into v_excess from public.service_concepts where is_active and billing_family<>'system'
    and coalesce(matrix_visible,true) and service_category='secondary' order by concept_id limit 1;
  if v_toll is null or v_excess is null then raise exception 'QA needs active catalogs'; end if;
  v_payload:=jsonb_build_object(
    'nro_remito','QA-HO-'||v_suffix,'nro_servicio','QA-EXT-'||v_suffix,'status','pendiente',
    'patente','QA123AB','marca_modelo','Vehículo QA','tipo_servicio','Remolque',
    'razon_social','Socio QA','cuit','20123456789','telefono','1155551234',
    'origen','Origen QA','destino','Destino QA','km_reales',18,'observaciones','Fixture transaccional',
    'origin_place_id','qa-origin','destination_place_id','qa-destination',
    'origin_formatted_address','Origen QA','destination_formatted_address','Destino QA',
    'origin_lat',-34.6,'origin_lng',-58.4,'destination_lat',-34.7,'destination_lng',-58.5,
    'maps_version',1,'addons_version',2,
    'tolls',jsonb_build_array(jsonb_build_object('client_line_id',gen_random_uuid(),'toll_id',v_toll,'unit_amount',2500,'customer_payment_method','cash')),
    'excesses',jsonb_build_array(jsonb_build_object('client_line_id',gen_random_uuid(),'concept_id',v_excess,'unit_amount',8000,'customer_payment_method','not_collected')),
    'evidence','[]'::jsonb
  );
  v_result:=public.save_driver_ad_hoc_remito_v3(v_payload,v_operation);
  v_intake:=(v_result->>'intake_id')::uuid; v_remito:=(v_result->>'remito_id')::integer;
  v_payload:=v_payload||jsonb_build_object('nro_servicio','QA-EDIT-'||v_suffix);
  perform public.save_driver_ad_hoc_remito_v3(v_payload,v_operation);
  if (select service_reference from public.driver_service_intakes where intake_id=v_intake) is distinct from 'QA-EDIT-'||v_suffix then
    raise exception 'Draft service number was lost';
  end if;
  v_payload:=v_payload||jsonb_build_object('status','firmado','firma_imagen_url','https://example.invalid/qa-signature.png','firmado_at',now(),
    'conformidad_servicio',true,'conformidad_cargos',true,'sin_danos',true,'conformidad_arrastre',true,'cliente_presente',true);
  perform public.save_driver_ad_hoc_remito_v3(v_payload,v_operation);
  perform set_config('request.jwt.claim.sub',v_operator::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_operator,'role','authenticated')::text,true);
  v_context:=public.get_driver_service_intake_context_v1(v_intake);
  if v_context#>>'{service,customer_document}' is distinct from '20123456789' or v_context#>>'{service,customer_phone}' is distinct from '1155551234'
    or v_context#>>'{service,origin_place_id}' is distinct from 'qa-origin' then raise exception 'Signed intake lost customer or Maps data'; end if;
  if (v_context#>>'{addons,tolls,0,total_amount}')::numeric is distinct from 2500
    or (v_context#>>'{addons,excesses,0,total_amount}')::numeric is distinct from 8000
    or v_context#>>'{addons,excesses,0,customer_payment_method}' is distinct from 'not_collected' then raise exception 'Reported charges lost'; end if;
  v_created:=public.create_and_link_driver_service_intake_v1(v_intake,jsonb_build_object(
    'company_id','751efad5-e34c-40b6-862e-72e3fdbaa1df','billing_base_id','617896d4-8d31-44a3-9fe1-a838e7d6eaaf',
    'primary_concept_id','253db15e-a4ae-4cde-9478-16a5c55c8670','category_id','253db15e-a4ae-4cde-9478-16a5c55c8670',
    'scheduled_for',now(),'estimated_asphalt_km',42,'estimated_gravel_km',0,'estimated_distance_km',42,
    'items','[]'::jsonb,'commercial_addons',jsonb_build_object('toll_coverage_mode','customer_roundtrip','tolls','[]'::jsonb,'excess_charges','[]'::jsonb)));
  v_service:=(v_created->>'service_id')::uuid;
  v_replay:=public.create_and_link_driver_service_intake_v1(v_intake,'{}'::jsonb);
  if v_replay->>'service_id' is distinct from v_created->>'service_id' or (v_replay->>'idempotent')::boolean is distinct from true then raise exception 'Create retry not idempotent'; end if;
  select * into v_row from public.operator_services where service_id=v_service;
  if v_row.customer_document is distinct from '20123456789' or v_row.customer_phone is distinct from '1155551234'
    or v_row.origin_place_id is distinct from 'qa-origin' or v_row.service_order_number is distinct from 'QA-EDIT-'||v_suffix
    or v_row.remito_id is distinct from v_remito or v_row.document_status is distinct from 'submitted'
    or v_row.administrative_review_status is distinct from 'pending' or v_row.estimated_distance_km is distinct from 42 then raise exception 'Service handoff mismatch'; end if;
  v_context:=public.get_operator_service_handoff_context_v1(v_service);
  if (v_context#>>'{service,reported_distance_km}')::numeric is distinct from 18
    or (v_context#>>'{reported_addons,tolls,0,total_amount}')::numeric is distinct from 2500
    or (v_context#>>'{reported_addons,excesses,0,total_amount}')::numeric is distinct from 8000 then raise exception 'Reopened service lost reported data'; end if;
  if exists(select 1 from public.operator_service_tolls where service_id=v_service)
    or exists(select 1 from public.operator_service_excess_charges where service_id=v_service) then
    raise exception 'Reported charges duplicated into planned/actual before review';
  end if;
end;
$test$;
rollback;
select 'PASS: deployed RPC handoff; all synthetic rows rolled back' as result;
