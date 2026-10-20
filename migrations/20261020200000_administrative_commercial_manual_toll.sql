-- Corrección administrativa: peaje «Manual / Varios» · 20/10/2026
-- El chofer puede informar un peaje sin catálogo («Manual / Varios»). Al guardar la corrección después de la firma,
-- validate_administrative_commercial_v1 buscaba cada peaje en toll_locations y lo rechazaba con
-- «Concepto inexistente o no habilitado». Ahora, sin toll_id, el peaje va con su nombre (o «Manual / Varios»),
-- igual que lo acepta el cierre (resolve_operator_service_document_v5). Un toll_id que no existe se sigue rechazando.
do $mig$ declare d text; n int; t text; begin
  d := replace(pg_get_functiondef('app_private.validate_administrative_commercial_v1(uuid,uuid,jsonb)'::regprocedure), E'\r', '');
  if position('Manual / Varios' in d) = 0 then
    t := $a$    select name into label from public.toll_locations where toll_id=id and is_active;$a$;
    n := (length(d)-length(replace(d,t,'')))/length(t); if n <> 1 then raise exception 'validate admin: búsqueda del peaje no encontrada'; end if;
    d := replace(d, t, $b$    if id is null then label:=left(coalesce(nullif(btrim(coalesce(x->>'toll_name','')),''),'Manual / Varios'),80);
    else select name into label from public.toll_locations where toll_id=id and is_active; end if;$b$);
    execute d;
  end if;
end $mig$;
