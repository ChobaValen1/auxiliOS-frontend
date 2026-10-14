-- Synthetic assigned-service integration; no production rows survive this transaction.
begin;
do $test$
declare
  v_driver uuid:=gen_random_uuid(); v_operator uuid:=gen_random_uuid(); v_operation uuid:=gen_random_uuid();
  v_suffix text:=left(replace(gen_random_uuid()::text,'-',''),10);
  v_truck integer:=-2060907002; v_log integer:=-2060907002;
  v_created jsonb; v_saved jsonb; v_draft jsonb; v_context jsonb; v_queue jsonb;
  v_service uuid; v_payload jsonb; v_original jsonb; v_commercial jsonb; v_toll uuid; v_excess uuid; v_result jsonb;
begin
  if exists(select 1 from public.trucks where truck_id=v_truck)
    or exists(select 1 from public.daily_logs where log_id=v_log) then raise exception 'QA fixture IDs occupied'; end if;
  insert into public.users(user_id,role_id,legajo,email,password_hash,full_name,is_test)
    values(v_driver,(select role_id from public.roles where name='chofer'),'QAD'||v_suffix,v_driver||'@example.invalid','DISABLED-QA-NO-AUTH-ACCOUNT','QA assigned driver',true),
      (v_operator,(select role_id from public.roles where name='operador'),'QAO'||v_suffix,v_operator||'@example.invalid','DISABLED-QA-NO-AUTH-ACCOUNT','QA assigned operator',true);
  insert into public.trucks(truck_id,plate,numero_interno,is_test,assigned_to) values(v_truck,'QA'||left(v_suffix,8),'QA assigned',true,v_driver);
  perform set_config('request.jwt.claim.sub',v_driver::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_driver,'role','authenticated')::text,true);
  insert into public.daily_logs(log_id,driver_id,truck_id,km_inicio,km_inicio_origen) values(v_log,v_driver,v_truck,0,'ia');
  perform set_config('request.jwt.claim.sub',v_operator::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_operator,'role','authenticated')::text,true);
  v_created:=public.create_operator_service_v4(jsonb_build_object(
    'company_id','751efad5-e34c-40b6-862e-72e3fdbaa1df','billing_base_id','617896d4-8d31-44a3-9fe1-a838e7d6eaaf',
    'primary_concept_id','253db15e-a4ae-4cde-9478-16a5c55c8670','category_id','253db15e-a4ae-4cde-9478-16a5c55c8670',
    'service_order_number','QA-ASG-'||v_suffix,'customer_name','Socio QA','customer_document','20123456789','customer_phone','1155551234',
    'vehicle_plate','QA123AB','vehicle_make_model','Vehículo QA','assigned_driver_id',v_driver,'assigned_truck_id',v_truck,
    'origin','Origen QA','destination','Destino QA','origin_place_id','qa-o','destination_place_id','qa-d',
    'origin_lat',-34.6,'origin_lng',-58.4,'destination_lat',-34.7,'destination_lng',-58.5,
    'origin_formatted_address','Origen QA','destination_formatted_address','Destino QA',
    'scheduled_for',now(),'estimated_asphalt_km',42,'estimated_gravel_km',0,'estimated_distance_km',42,
    'items','[]'::jsonb,'commercial_addons',jsonb_build_object('toll_coverage_mode','customer_roundtrip','tolls','[]'::jsonb,'excess_charges','[]'::jsonb)));
  v_service:=(v_created->>'service_id')::uuid;
  perform set_config('request.jwt.claim.sub',v_driver::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_driver,'role','authenticated')::text,true);
  v_queue:=public.get_driver_operator_queue_v4();
  if v_queue#>>'{0,customer_document}' is distinct from '20123456789' then raise exception 'Assigned queue omitted document'; end if;
  v_payload:=jsonb_build_object('nro_remito','QA-ASG-R-'||v_suffix,'nro_servicio','QA-ASG-'||v_suffix,'status','pendiente',
    'razon_social','Socio QA','patente','QA123AB','marca_modelo','Vehículo QA','origen','Origen QA','destino','Destino QA',
    'km_reales',18,'addons_version',2,'tolls','[]'::jsonb,'excesses','[]'::jsonb,'evidence','[]'::jsonb);
  v_saved:=public.save_driver_operator_service_remito_v4(v_service,v_payload,v_operation);
  v_draft:=public.get_driver_operator_service_remito_draft_v1(v_service);
  if v_draft->>'customer_document' is distinct from '20123456789'
    or v_draft->>'customer_phone' is distinct from '1155551234'
    or v_draft->>'origin_place_id' is distinct from 'qa-o'
    or v_draft->>'nro_servicio' is distinct from 'QA-ASG-'||v_suffix then raise exception 'Assigned draft did not reopen completely'; end if;
  v_payload:=v_payload||jsonb_build_object('status','firmado','firma_imagen_url','https://example.invalid/qa-signature.png','firmado_at',now(),
    'conformidad_servicio',true,'conformidad_cargos',true,'sin_danos',true,'conformidad_arrastre',true,'cliente_presente',true);
  perform public.save_driver_operator_service_remito_v4(v_service,v_payload,v_operation);
  perform set_config('request.jwt.claim.sub',v_operator::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_operator,'role','authenticated')::text,true);
  v_context:=public.get_operator_service_handoff_context_v1(v_service);
  if (v_context#>>'{service,estimated_distance_km}')::numeric is distinct from 42
    or (v_context#>>'{service,reported_distance_km}')::numeric is distinct from 18
    or v_context#>>'{service,customer_document}' is distinct from '20123456789'
    or v_context#>>'{service,customer_phone}' is distinct from '1155551234'
    or v_context#>>'{service,document_status}' is distinct from 'submitted' then raise exception 'Assigned final handoff mismatch'; end if;

  select to_jsonb(r) into v_original from public.remitos r where remito_id=(v_saved->>'remito_id')::integer;
  select toll_id into v_toll from public.toll_locations where is_active order by toll_id limit 1;
  select c.concept_id into v_excess from public.service_concepts c join public.company_service_settings cs on cs.concept_id=c.concept_id
   where cs.company_id='751efad5-e34c-40b6-862e-72e3fdbaa1df' and cs.is_enabled and c.is_active and c.service_category in ('secondary','mixed') and c.default_can_be_secondary and c.billing_family<>'system' order by c.concept_id limit 1;
  if v_toll is null or v_excess is null then raise exception 'Fixture needs active catalogs'; end if;
  v_commercial:=jsonb_build_object('toll_coverage_mode','provider_roundtrip',
   'tolls',jsonb_build_array(jsonb_build_object('review_line_client_id',gen_random_uuid(),'toll_id',v_toll,'quantity',2,'unit_amount',3100,'payer_agent','provider')),
   'excess_charges',jsonb_build_array(jsonb_build_object('review_line_client_id',gen_random_uuid(),'concept_id',v_excess,'quantity',1,'unit_amount',1700,'payer_agent','provider')));
  perform public.update_operator_service_v4(v_service,jsonb_build_object('administrative_revision',0,'service_order_number','QA-CORRECTED-'||v_suffix,'origin','Origen corregido QA','origin_place_id','qa-corrected','administrative_commercial',v_commercial));
  v_context:=public.get_operator_service_handoff_context_v2(v_service);
  if v_context#>>'{service,service_order_number}' is distinct from 'QA-CORRECTED-'||v_suffix or v_context#>>'{administrative_commercial,tolls,0,unit_amount}' is distinct from '3100.00' then raise exception 'Correction did not reopen'; end if;
  if (select to_jsonb(r) from public.remitos r where remito_id=(v_saved->>'remito_id')::integer) is distinct from v_original then raise exception 'Signed original mutated'; end if;
  if v_context#>>'{service,document_status}' is distinct from 'submitted' then raise exception 'Save approved document unexpectedly'; end if;
  if exists(select 1 from public.operator_service_tolls where service_id=v_service and source='actual') then raise exception 'Save generated actual charges'; end if;
  begin
   perform public.update_operator_service_v4(v_service,jsonb_build_object('administrative_revision',1,'customer_name','Tampered'));
   raise exception 'Protected customer allowed';
  exception when others then if sqlerrm not like 'Campo protegido%' then raise; end if; end;
  begin
   perform public.update_operator_service_v4(v_service,jsonb_build_object('administrative_revision',0,'service_order_number','stale'));
   raise exception 'Stale update allowed';
  exception when others then if sqlerrm not like 'El servicio cambió%' then raise; end if; end;
  v_context:=public.get_operator_service_remito_review_v3(v_service);
  if v_context#>>'{reported,tolls,0,unit_amount}' is distinct from '3100.00' then raise exception 'Review lost effective amount'; end if;
  v_result:=public.resolve_operator_service_document_v5(v_service,'approve_and_finalize',jsonb_build_object('administrative_revision',1,
   'tolls',(select jsonb_agg(x||jsonb_build_object('decision','adjusted')) from jsonb_array_elements(v_context#>'{reported,tolls}') x),
   'excesses',(select jsonb_agg(x||jsonb_build_object('decision','adjusted','collector_agent','provider')) from jsonb_array_elements(v_context#>'{reported,excesses}') x)));
  if v_result->>'status'<>'completed' or v_result->>'document_status'<>'approved' then raise exception 'Fixture approval failed'; end if;
  if (select count(*) from public.operator_service_tolls where service_id=v_service and source='actual' and payer_agent='provider' and unit_amount=3100)<>1 then raise exception 'Provider toll charge missing'; end if;
  if (select count(*) from public.operator_service_excess_charges where service_id=v_service and source='actual' and payer_agent='provider' and unit_amount=1700)<>1 then raise exception 'Provider excess charge missing'; end if;
  v_result:=public.resolve_operator_service_document_v5(v_service,'approve_and_finalize','{}');
  if not (v_result->>'idempotent')::boolean then raise exception 'Close retry not idempotent'; end if;

end;
$test$;
rollback;
select 'PASS: administrative correction/read/approval/idempotence; synthetic rows rolled back' as result;
