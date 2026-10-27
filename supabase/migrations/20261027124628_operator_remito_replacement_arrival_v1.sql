-- An arrival without the driver's arrival mark cannot accept a fresh document in
-- the existing queue. Reset that arrival and retain its provenance in the audit.
do $patch$
declare d text; n text;
begin
 d:=pg_get_functiondef('public.replace_operator_service_remito_v1(uuid,integer,text)'::regprocedure);
 n:=replace(d,$a$s.status='at_origin' and s.arrival_source='signature' and s.driver_arrived_at is null$a$,$a$s.status='at_origin' and s.driver_arrived_at is null$a$);
 n:=replace(n,$a$'previous_document_status',s.document_status$a$,$a$'previous_arrival',jsonb_build_object('arrived_at',s.arrived_at,'arrived_by',s.arrived_by,'source',s.arrival_source,'reason_code',s.arrival_reason_code),'previous_document_status',s.document_status$a$);
 if n=d then raise exception 'Revisar el flujo de reemplazo antes de ajustar el arribo';end if;
 execute n;
end $patch$;
