-- Tercerizados · finalizar un servicio Tercerizada sin chofer ni móvil · 19/10/2026 (pedido del dueño)
-- Antes: para finalizar, el servicio tenía que estar ASIGNADO o ARRIBADO, y asignar pide chofer y móvil propios,
-- así que un servicio tercerizado quedaba trabado en PENDIENTE (caso 20261016300838).
-- Ahora, con Logística Tercerizada:
--   · se finaliza desde PENDIENTE (también desde ASIGNADO o ARRIBADO, como antes);
--   · hace falta haber elegido el tercerizado (outsourced_service_costs con provider_id);
--   · no se piden las Observaciones de «finalizar sin arribo» ni «Chofer y móvil» obligatorios.
-- Los servicios con logística Propia siguen exactamente igual.
-- Se aplica con reemplazos puntuales sobre las funciones vigentes (falla si alguno no encuentra su texto).
do $mig$ declare d text; begin
  -- 1) Trigger de estados: PENDIENTE → FINALIZADO sólo para Tercerizada y vía finalize.
  d := pg_get_functiondef('app_private.operator_services_before_update'::regproc);
  if position('third_party' in d)=0 then
    d := replace(d, $a$    elsif old.status in ('assigned','at_origin') and new.status='completed' and v_transition='finalize' then null;$a$,
$b$    elsif old.status in ('assigned','at_origin') and new.status='completed' and v_transition='finalize' then null;
    elsif old.status='pending' and new.status='completed' and v_transition='finalize' and coalesce(new.logistics_type,'own')='third_party' then null;$b$);
    if position('third_party' in d)=0 then raise exception 'operator_services_before_update: no se encontró el texto a reemplazar'; end if;
    execute d;
  end if;

  -- 2) Campos obligatorios: «Chofer y móvil» no aplica a Tercerizada.
  d := pg_get_functiondef('app_private.operator_service_missing_required_v2'::regproc);
  if position('third_party' in d)=0 then
    d := replace(d, $a$req:=coalesce(v_modes->>'assigned_resources','optional')='required';$a$,
      $b$req:=coalesce(v_modes->>'assigned_resources','optional')='required' and coalesce(s.logistics_type,'own')<>'third_party';$b$);
    if position('third_party' in d)=0 then raise exception 'operator_service_missing_required_v2: no se encontró el texto a reemplazar'; end if;
    execute d;
  end if;

  -- 3) Finalizar: Tercerizada desde PENDIENTE, con tercerizado elegido.
  d := pg_get_functiondef('public.transition_operator_service_v2'::regproc);
  if position('v_third' in d)=0 then
    d := replace(d, 'v_missing text[]; v_label text;', 'v_missing text[]; v_label text; v_third boolean;');
    d := replace(d, $a$if not found then raise exception 'Servicio inexistente'; end if;
  if v_action in$a$, $b$if not found then raise exception 'Servicio inexistente'; end if;
  v_third := coalesce(s.logistics_type,'own')='third_party';
  if v_action in$b$);
    d := replace(d, $a$    if s.status not in ('assigned','at_origin') then raise exception 'Solo un servicio ASIGNADO o ARRIBADO puede finalizarse'; end if;
    if s.status='assigned' and nullif(btrim(coalesce(s.operator_notes,'')),'') is null then raise exception 'Para finalizar sin ARRIBADO completá Observaciones'; end if;$a$,
$b$    if v_third then
      if s.status not in ('pending','assigned','at_origin') then raise exception 'Solo un servicio PENDIENTE, ASIGNADO o ARRIBADO puede finalizarse'; end if;
      if not exists (select 1 from public.outsourced_service_costs c where c.service_id=p_service_id and c.provider_id is not null) then
        raise exception 'Para finalizar un servicio tercerizado, elegí qué tercerizado lo hizo (Editar servicio › ¿Quién hace el servicio?)';
      end if;
    else
      if s.status not in ('assigned','at_origin') then raise exception 'Solo un servicio ASIGNADO o ARRIBADO puede finalizarse'; end if;
      if s.status='assigned' and nullif(btrim(coalesce(s.operator_notes,'')),'') is null then raise exception 'Para finalizar sin ARRIBADO completá Observaciones'; end if;
    end if;$b$);
    if position('v_third then' in d)=0 or position('v_third := ' in d)=0 then raise exception 'transition_operator_service_v2: no se encontró el texto a reemplazar'; end if;
    execute d;
  end if;
end $mig$;
