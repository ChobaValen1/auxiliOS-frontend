-- Arreglo del servicio 20261014302952 (SOS, Cristian Sack) · 14/10/2026
-- El chofer empezó un remito sin asignación (ING-20261014-00041) 28 s antes de que el
-- operador creara el servicio. El borrador quedó anulado y su viaje (722) quedó abierto,
-- lo que frena al chofer con "Tenés el servicio 302952 sin terminar".
-- Esto le pasa el viaje al servicio asignado y marca el ingreso como resuelto.
-- Correr UNA sola vez, entero, en el SQL Editor de Supabase.
begin;
select set_config('app.phase3_bridge','1',true);

update public.operator_services set trip_id=722,
  operator_notes=concat_ws(E'\n',nullif(operator_notes,''),'Ingreso ING-20261014-00041 iniciado por el Chofer: se tomó su viaje (16:39). El borrador del remito quedó anulado; el Chofer completa el remito desde el servicio.'),
  updated_by='467001a3-87b9-4b54-b0a1-c317fed59e48', updated_at=now()
where service_id='853beb31-a965-458f-bac6-627cc42a5183' and status='assigned' and trip_id is null and remito_id is null;

update public.driver_service_intakes set status='linked', linked_service_id='853beb31-a965-458f-bac6-627cc42a5183',
  linked_at=now(), linked_by='467001a3-87b9-4b54-b0a1-c317fed59e48', updated_at=now()
where intake_id='c6459149-8c0a-46fc-9170-c0dd367f971f' and status='pending_admin';

insert into public.driver_service_intake_events(intake_id,event_type,notes,created_by,details)
values('c6459149-8c0a-46fc-9170-c0dd367f971f','linked','Ingreso vinculado a 20261014302952 por Administración (borrador anulado; se reutiliza el viaje)','467001a3-87b9-4b54-b0a1-c317fed59e48',jsonb_build_object('service_id','853beb31-a965-458f-bac6-627cc42a5183','trip_id',722));

insert into public.operator_service_events(service_id,event_type,from_status,to_status,notes,created_by,details)
values('853beb31-a965-458f-bac6-627cc42a5183','driver_intake_linked','assigned','assigned','Ingreso de Chofer vinculado: se reutiliza su viaje de las 16:39','467001a3-87b9-4b54-b0a1-c317fed59e48',jsonb_build_object('intake_id','c6459149-8c0a-46fc-9170-c0dd367f971f','trip_id',722));

-- Control: tiene que dar 722 y linked
select (select trip_id from public.operator_services where service_id='853beb31-a965-458f-bac6-627cc42a5183') viaje_del_servicio,
       (select status from public.driver_service_intakes where intake_id='c6459149-8c0a-46fc-9170-c0dd367f971f') ingreso;
commit;
