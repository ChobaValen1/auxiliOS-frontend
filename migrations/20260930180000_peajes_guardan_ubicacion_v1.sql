-- save_simple_toll ignoraba latitude/longitude: la pantalla de Peajes verifica la
-- dirección con Google y manda las coordenadas, pero la base las descartaba y todos
-- los peajes quedaron sin ubicación. Ahora se guardan cuando vienen; si no vienen
-- (dirección sin verificar), se conserva la ubicación que ya tenía.
do $mig$
declare
  v_def text := pg_get_functiondef('public.save_simple_toll(jsonb)'::regprocedure);
  v_new text;
begin
  if position('ubicacion_v1' in v_def) > 0 then return; end if;
  v_new := replace(v_def,
    'insert into public.toll_locations(code,name,road,direction,is_active,created_by,updated_by)
    values(''PEAJE-'' || upper(substr(replace(gen_random_uuid()::text, ''-'', ''''), 1, 12)),v_name,v_address,''both'',v_is_active,v_uid,v_uid)',
    'insert into public.toll_locations(code,name,road,direction,is_active,created_by,updated_by,latitude,longitude)
    values(''PEAJE-'' || upper(substr(replace(gen_random_uuid()::text, ''-'', ''''), 1, 12)),v_name,v_address,''both'',v_is_active,v_uid,v_uid,
      nullif(p_payload->>''latitude'','''')::numeric,nullif(p_payload->>''longitude'','''')::numeric) /* ubicacion_v1 */');
  if v_new = v_def then raise exception 'save_simple_toll: no se encontró el insert'; end if;
  v_def := v_new;
  v_new := replace(v_def,
    'set name=v_name, road=v_address, is_active=v_is_active, updated_by=v_uid, updated_at=now()',
    'set name=v_name, road=v_address, is_active=v_is_active, updated_by=v_uid, updated_at=now(),
        latitude=coalesce(nullif(p_payload->>''latitude'','''')::numeric, latitude),
        longitude=coalesce(nullif(p_payload->>''longitude'','''')::numeric, longitude)');
  if v_new = v_def then raise exception 'save_simple_toll: no se encontró el update'; end if;
  execute v_new;
end
$mig$;
