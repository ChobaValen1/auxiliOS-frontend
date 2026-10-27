-- Operator/admin replacement of a linked document. The signed original remains auditable.
create or replace function public.replace_operator_service_remito_v1(p_service_id uuid,p_remito_id integer,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $f$
declare s public.operator_services%rowtype; r public.remitos%rowtype; uid uuid:=auth.uid();
 role text:=app_private.current_auxilios_role(); v_reason text:=nullif(btrim(p_reason),'');
 previous_bridge text:=coalesce(current_setting('app.phase3_bridge',true),'');
 previous_transition text:=coalesce(current_setting('app.lifecycle_transition',true),'');
 next_status text; audit jsonb;
begin
 if uid is null or coalesce(role,'') not in ('operador','administracion') then raise exception 'Solo Operador o Administración pueden reemplazar un remito' using errcode='42501';end if;
 if v_reason is null or length(v_reason)<5 or length(v_reason)>1000 then raise exception 'Indicá el motivo del reemplazo (entre 5 y 1000 caracteres)';end if;
 select * into s from public.operator_services where service_id=p_service_id for update;
 if not found then raise exception 'Servicio inexistente';end if;
 if s.remito_id is distinct from p_remito_id or p_remito_id is null then raise exception 'El remito del servicio cambió. Actualizá la pantalla';end if;
 if s.status not in ('assigned','at_origin') or s.driver_activated or s.assigned_driver_id is null then raise exception 'Solo se puede reemplazar el remito de un servicio abierto con chofer asignado';end if;
 if s.billing_status='invoiced' then raise exception 'El servicio está facturado';end if;
 select * into r from public.remitos where remito_id=p_remito_id for update;
 if not found or r.status not in ('pendiente','firmado') or r.operator_service_id is distinct from p_service_id then raise exception 'El remito ya no está disponible para reemplazar';end if;
 -- Accepted collections are accounting records, not discarded with a document.
 perform 1 from public.service_collection_reports where remito_id=r.remito_id for update;
 if exists(select 1 from public.service_collection_reports where remito_id=r.remito_id and status='approved') then raise exception 'El remito tiene cobros aprobados. Revisalos antes de reemplazarlo';end if;
 audit:=jsonb_build_object('remito_id',r.remito_id,'nro_remito',r.nro_remito,'reason',v_reason,'role',role,
  'previous_document_status',s.document_status,'previous_administrative_commercial',s.administrative_commercial,
  'derived_tolls',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from public.operator_service_tolls t where t.service_id=s.service_id and t.source='actual' and t.remito_toll_report_id in(select toll_report_id from public.remito_toll_reports where remito_id=r.remito_id)),
  'derived_excesses',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.operator_service_excess_charges x where x.service_id=s.service_id and x.source='actual' and x.remito_excess_report_id in(select excess_report_id from public.remito_excess_reports where remito_id=r.remito_id)));
 delete from public.operator_service_tolls t where t.service_id=s.service_id and t.source='actual' and t.remito_toll_report_id in(select toll_report_id from public.remito_toll_reports where remito_id=r.remito_id);
 delete from public.operator_service_excess_charges x where x.service_id=s.service_id and x.source='actual' and x.remito_excess_report_id in(select excess_report_id from public.remito_excess_reports where remito_id=r.remito_id);
 update public.service_collection_reports set status='rejected',review_note='Remito reemplazado: '||v_reason,reviewed_by=uid,reviewed_at=now(),updated_at=now() where remito_id=r.remito_id and status='pending';
 update public.remitos set status='anulado',observaciones=concat_ws(E'\n',nullif(observaciones,''),'REEMPLAZO SOLICITADO: '||v_reason),sync_status='synced' where remito_id=r.remito_id;
 -- The existing document triggers run first; detach the current pointer afterwards.
 next_status:=case when s.status='at_origin' and s.arrival_source='signature' and s.driver_arrived_at is null then 'assigned' else s.status end;
 perform set_config('app.phase3_bridge','1',true);
 perform set_config('app.lifecycle_transition','unarrive',true);
 update public.operator_services set remito_id=null,status=next_status,document_status='not_started',
  administrative_review_status='pending',billing_status='not_ready',administrative_commercial=null,
  administrative_revision=coalesce(administrative_revision,0)+1,
  arrived_at=case when next_status='assigned' then null else arrived_at end,
  arrived_by=case when next_status='assigned' then null else arrived_by end,
  arrival_source=case when next_status='assigned' then null else arrival_source end,
  arrival_reason_code=case when next_status='assigned' then null else arrival_reason_code end,
  updated_by=uid,updated_at=now() where service_id=s.service_id;
 insert into public.operator_service_events(service_id,event_type,from_status,to_status,notes,created_by,details)
 values(s.service_id,'remito_replacement_requested',s.status,next_status,'Remito anulado; se solicita uno nuevo al chofer: '||v_reason,uid,audit);
 perform set_config('app.phase3_bridge',previous_bridge,true);perform set_config('app.lifecycle_transition',previous_transition,true);
 return jsonb_build_object('service_id',s.service_id,'previous_remito_id',r.remito_id,'document_status','not_started','status',next_status);
end $f$;
revoke all on function public.replace_operator_service_remito_v1(uuid,integer,text) from public,anon;
grant execute on function public.replace_operator_service_remito_v1(uuid,integer,text) to authenticated;

-- A queued offline operation for the old document must never revive its signature.
do $patch$
declare d text; n text;
begin
 d:=pg_get_functiondef('public.save_driver_operator_service_remito_v3(uuid,jsonb,uuid)'::regprocedure);
 if position('REMITO_REPLACED' in d)>0 then return;end if;
 n:=replace(d,'  if v_existing and r.operator_service_id is not null',E'  if v_existing and r.status=\x27anulado\x27 then\n    raise exception \x27REMITO_REPLACED: Este remito fue anulado. Actualizá tus servicios y creá uno nuevo\x27;\n  end if;\n  if v_existing and r.operator_service_id is not null');
 if n=d then raise exception 'El guardado de remitos cambió; revisar antes de habilitar reemplazos';end if;
 execute n;
end $patch$;
