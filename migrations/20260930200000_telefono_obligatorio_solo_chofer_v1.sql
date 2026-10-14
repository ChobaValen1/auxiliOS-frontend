-- El teléfono del cliente es obligatorio sólo en el remito del chofer (salvo "El cliente no informa
-- teléfono"); Operaciones y Administración pueden crear y finalizar servicios sin teléfono.
--  · validate_private_customer_v1: en un particular el teléfono ya no es obligatorio; si se carga,
--    tiene que tener al menos 8 números.
--  · operator_service_missing_required_v2: el teléfono nunca cuenta como faltante.
do $mig$
declare
  v_def text;
  v_new text;
begin
  v_def := pg_get_functiondef('app_private.validate_private_customer_v1(jsonb)'::regprocedure);
  if position('telefono_chofer_v1' in v_def) = 0 then
    v_new := replace(v_def,
      'if length(v_phone) < 8 then
    raise exception ''Completá el teléfono del cliente'';
  end if;',
      'if v_phone <> '''' and length(v_phone) < 8 then /* telefono_chofer_v1 */
    raise exception ''El teléfono del cliente tiene que tener al menos 8 números'';
  end if;');
    if v_new = v_def then raise exception 'validate_private_customer_v1: no se encontró la validación del teléfono'; end if;
    execute v_new;
  end if;

  v_def := pg_get_functiondef('app_private.operator_service_missing_required_v2(uuid,jsonb)'::regprocedure);
  if position('telefono_chofer_v1' in v_def) = 0 then
    v_new := replace(v_def,
      'req:=coalesce(v_modes->>''customer_phone'',''optional'')=''required'';',
      'req:=false; /* telefono_chofer_v1: el teléfono sólo es obligatorio para el chofer */');
    if v_new = v_def then raise exception 'operator_service_missing_required_v2: no se encontró la regla del teléfono'; end if;
    execute v_new;
  end if;
end
$mig$;
