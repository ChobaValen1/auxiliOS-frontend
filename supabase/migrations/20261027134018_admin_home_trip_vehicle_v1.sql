-- Trips reference their vehicle through the daily log, not directly.
do $patch$
declare d text; n text;
begin
 d:=pg_get_functiondef('app_private.admin_home_summary_v1(date,text,timestamptz)'::regprocedure);
 n:=replace(d,'coalesce(t.truck_id,s.assigned_truck_id)','coalesce(journey.truck_id,s.assigned_truck_id)');
 n:=replace(n,'left join public.trips t on t.trip_id=s.trip_id','left join public.trips t on t.trip_id=s.trip_id left join public.daily_logs journey on journey.log_id=t.log_id');
 if n=d then raise exception 'Revisar la relación viaje/jornada del Inicio';end if;
 execute n;
end $patch$;
