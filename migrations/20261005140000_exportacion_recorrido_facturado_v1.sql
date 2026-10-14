-- La exportación de Facturación a Excel arma el recorrido de Google Maps con el recorrido que se factura
-- (Base → Origen → Destino → Base, según la configuración de la prestadora). Para eso la fila exportada
-- necesita la base (dirección y coordenadas) y el modo de recorrido vigente en la fecha del servicio.
do $mig$
declare
  v_def text := pg_get_functiondef('public.get_operator_billing_export_rows_v1(uuid[])'::regprocedure);
  v_new text;
begin
  if position('billing_route_mode' in v_def) > 0 then return; end if;

  v_new := replace(v_def,
    'coalesce(b.name,''Sin base'') billing_base_name,',
    'coalesce(b.name,''Sin base'') billing_base_name,nullif(btrim(b.address),'''') billing_base_address,b.latitude billing_base_latitude,b.longitude billing_base_longitude,' ||
    '(select bs.route_mode from public.company_billing_settings bs where bs.company_id=s.company_id and bs.is_active ' ||
    'and bs.valid_from<=coalesce((s.scheduled_for at time zone ''America/Argentina/Buenos_Aires'')::date,current_date) ' ||
    'and (bs.valid_until is null or bs.valid_until>=coalesce((s.scheduled_for at time zone ''America/Argentina/Buenos_Aires'')::date,current_date)) ' ||
    'order by (bs.contract_id is null) desc,bs.valid_from desc,bs.created_at desc limit 1) billing_route_mode,');
  if v_new = v_def then raise exception 'get_operator_billing_export_rows_v1: no se encontró la columna de la base'; end if;

  v_def := v_new;
  v_new := replace(v_def,
    '''billing_base_name'',r.billing_base_name,',
    '''billing_base_name'',r.billing_base_name,''billing_base_address'',r.billing_base_address,''billing_base_latitude'',r.billing_base_latitude,''billing_base_longitude'',r.billing_base_longitude,''billing_route_mode'',r.billing_route_mode,');
  if v_new = v_def then raise exception 'get_operator_billing_export_rows_v1: no se encontró el armado de la fila'; end if;

  execute v_new;
end
$mig$;
