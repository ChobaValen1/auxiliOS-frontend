-- Página pública del remito + encuesta de calidad.
--
-- Al finalizar un servicio el chofer (o Administración) envía por WhatsApp un
-- link /r/<token>. Esa página, sin login, muestra el resumen del remito,
-- permite descargar el PDF y responder una encuesta de calidad.
--
-- · remito_public_links: un token aleatorio (128 bits) por remito, con
--   vencimiento. Sin el token no se puede leer nada.
-- · remito_surveys: una respuesta por remito.
-- · Ambas tablas con RLS: Administración/Supervisión leen; nadie escribe
--   directo. Todo el acceso público pasa por funciones SECURITY DEFINER que
--   validan el token y devuelven solo lo necesario para el remito.

create table if not exists public.remito_public_links (
  token       text primary key default replace(gen_random_uuid()::text, '-', ''),
  remito_id   integer not null unique references public.remitos(remito_id) on delete cascade,
  created_by  uuid references public.users(user_id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '180 days'
);

create table if not exists public.remito_surveys (
  survey_id          bigint generated always as identity primary key,
  remito_id          integer not null unique references public.remitos(remito_id) on delete cascade,
  token              text not null references public.remito_public_links(token) on delete cascade,
  rating_general     smallint not null check (rating_general between 1 and 5),
  rating_puntualidad smallint check (rating_puntualidad between 1 and 5),
  rating_trato       smallint check (rating_trato between 1 and 5),
  recomendaria       boolean,
  comentario         text check (char_length(comentario) <= 1000),
  created_at         timestamptz not null default now()
);

comment on table public.remito_public_links is 'Link público (sin login) al remito: resumen, PDF y encuesta. Token aleatorio con vencimiento.';
comment on table public.remito_surveys is 'Encuesta de calidad respondida por el cliente desde el link público del remito (una por remito).';

alter table public.remito_public_links enable row level security;
alter table public.remito_surveys enable row level security;

drop policy if exists remito_public_links_select_management on public.remito_public_links;
create policy remito_public_links_select_management on public.remito_public_links
  for select to authenticated
  using (app_private.current_auxilios_role() = any (array['administracion','supervision']));

drop policy if exists remito_surveys_select_management on public.remito_surveys;
create policy remito_surveys_select_management on public.remito_surveys
  for select to authenticated
  using (app_private.current_auxilios_role() = any (array['administracion','supervision']));

-- Crear (o reusar) el link de un remito. Lo puede pedir Administración o el
-- chofer dueño del remito. Si ya existe, extiende el vencimiento.
create or replace function public.create_remito_public_link_v1(p_remito_id integer)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_driver uuid;
  v_token text;
begin
  if auth.uid() is null then raise exception 'Sesión requerida'; end if;
  select r.driver_id into v_driver from public.remitos r where r.remito_id = p_remito_id;
  if not found then raise exception 'Remito inexistente'; end if;
  if not (app_private.current_auxilios_role() = any (array['administracion','supervision'])
          or v_driver = auth.uid()) then
    raise exception 'Sin permiso para compartir este remito';
  end if;
  insert into public.remito_public_links (remito_id, created_by)
  values (p_remito_id, auth.uid())
  on conflict (remito_id) do update
    set expires_at = greatest(public.remito_public_links.expires_at, now() + interval '180 days')
  returning token into v_token;
  return v_token;
end
$function$;

-- Datos del remito para la página pública (sin login). Devuelve null si el
-- token no existe o venció. No expone teléfono ni datos internos.
create or replace function public.get_public_remito_v1(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_link public.remito_public_links%rowtype;
  v jsonb;
begin
  if p_token is null or char_length(p_token) < 24 then return null; end if;
  select * into v_link from public.remito_public_links l where l.token = p_token and l.expires_at > now();
  if not found then return null; end if;
  select jsonb_build_object(
    'remito', jsonb_build_object(
      'nro_remito', r.nro_remito,
      'nro_servicio', coalesce(s.service_order_number, r.nro_servicio),
      'status', r.status,
      'patente', r.patente,
      'marca_modelo', r.marca_modelo,
      'razon_social', r.razon_social,
      'cuit', r.cuit,
      'origen', r.origen,
      'destino', r.destino,
      'km_reales', r.km_reales,
      'imp_peaje', r.imp_peaje,
      'imp_excedente', r.imp_excedente,
      'imp_otros', r.imp_otros,
      'accepted_imp_total_extras', r.accepted_imp_total_extras,
      'pago_1_metodo', r.pago_1_metodo,
      'pago_2_metodo', r.pago_2_metodo,
      'conformidad_servicio', r.conformidad_servicio,
      'conformidad_cargos', r.conformidad_cargos,
      'sin_danos', r.sin_danos,
      'conformidad_arrastre', r.conformidad_arrastre,
      'foto_urls', coalesce(to_jsonb(r.foto_urls), '[]'::jsonb),
      'firma_imagen_url', r.firma_imagen_url,
      'firmado_at', r.firmado_at,
      'created_at_device', r.created_at_device,
      'chofer', u.full_name,
      'tipo_servicio', sc.name
    ),
    'empresa', (select jsonb_build_object('legal_name', c.legal_name, 'tax_id', c.tax_id, 'address', c.address, 'contact', c.contact)
                from public.company_document_settings c where c.id = true),
    'survey', (select jsonb_build_object('submitted', true, 'rating_general', sv.rating_general, 'created_at', sv.created_at)
               from public.remito_surveys sv where sv.remito_id = r.remito_id),
    'survey_open', r.status = 'firmado' and v_link.created_at > now() - interval '60 days'
  ) into v
  from public.remitos r
  left join public.users u on u.user_id = r.driver_id
  left join public.operator_services s on s.service_id = r.operator_service_id
  left join public.service_concepts sc on sc.concept_id = s.primary_concept_id
  where r.remito_id = v_link.remito_id;
  return v;
end
$function$;

-- Registrar la encuesta (una sola vez por remito).
create or replace function public.submit_remito_survey_v1(p_token text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_link public.remito_public_links%rowtype;
  v_status text;
  v_general smallint;
  v_id bigint;
begin
  select * into v_link from public.remito_public_links l where l.token = p_token and l.expires_at > now();
  if not found then raise exception 'El link no existe o venció'; end if;
  select r.status into v_status from public.remitos r where r.remito_id = v_link.remito_id;
  if v_status is distinct from 'firmado' then raise exception 'Este remito no admite encuesta'; end if;
  if v_link.created_at <= now() - interval '60 days' then raise exception 'La encuesta ya cerró'; end if;
  v_general := nullif(p_payload->>'rating_general', '')::smallint;
  if v_general is null or v_general not between 1 and 5 then raise exception 'Elegí una calificación de 1 a 5'; end if;
  insert into public.remito_surveys (remito_id, token, rating_general, rating_puntualidad, rating_trato, recomendaria, comentario)
  values (
    v_link.remito_id, v_link.token, v_general,
    case when (p_payload->>'rating_puntualidad') ~ '^[1-5]$' then (p_payload->>'rating_puntualidad')::smallint end,
    case when (p_payload->>'rating_trato') ~ '^[1-5]$' then (p_payload->>'rating_trato')::smallint end,
    case when p_payload ? 'recomendaria' and jsonb_typeof(p_payload->'recomendaria') = 'boolean' then (p_payload->>'recomendaria')::boolean end,
    nullif(left(btrim(coalesce(p_payload->>'comentario', '')), 1000), '')
  )
  on conflict (remito_id) do nothing
  returning survey_id into v_id;
  return jsonb_build_object('ok', true, 'already', v_id is null);
end
$function$;

revoke all on function public.create_remito_public_link_v1(integer) from public, anon;
grant execute on function public.create_remito_public_link_v1(integer) to authenticated;
revoke all on function public.get_public_remito_v1(text) from public;
grant execute on function public.get_public_remito_v1(text) to anon, authenticated;
revoke all on function public.submit_remito_survey_v1(text, jsonb) from public;
grant execute on function public.submit_remito_survey_v1(text, jsonb) to anon, authenticated;
