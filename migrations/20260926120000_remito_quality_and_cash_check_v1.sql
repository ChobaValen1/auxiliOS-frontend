-- Calidad y control de cobros de los remitos.
--
-- Control de cobro: en la encuesta del link público el cliente confirma si lo
-- que dice el remito que pagó en el lugar es correcto; si no, informa cuánto
-- pagó. Es la única forma de detectar un cobro que el chofer no registró.
--
-- · remito_surveys: cobro_confirmado / cobro_informado + seguimiento
--   (revisado_at, revisado_por, revisado_nota) para las alertas.
-- · submit_remito_survey_v1: guarda el control de cobro.
-- · get_remito_quality_summary_v1: resumen por período para Administración
--   (promedios, tasa de respuesta, cobros, por chofer y lista para revisar).
-- · mark_remito_survey_reviewed_v1: marcar una alerta como revisada.

alter table public.remito_surveys
  add column if not exists cobro_confirmado boolean,
  add column if not exists cobro_informado numeric(12,2) check (cobro_informado is null or cobro_informado >= 0),
  add column if not exists revisado_at timestamptz,
  add column if not exists revisado_por uuid references public.users(user_id),
  add column if not exists revisado_nota text check (revisado_nota is null or char_length(revisado_nota) <= 500);

comment on column public.remito_surveys.cobro_confirmado is 'El cliente confirma (true) o no (false) el importe que el remito dice que pagó en el lugar.';
comment on column public.remito_surveys.cobro_informado is 'Importe que el cliente dice haber pagado cuando no confirma el del remito.';

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
  v_confirmado boolean;
  v_informado numeric;
  v_id bigint;
begin
  select * into v_link from public.remito_public_links l where l.token = p_token and l.expires_at > now();
  if not found then raise exception 'El link no existe o venció'; end if;
  select r.status into v_status from public.remitos r where r.remito_id = v_link.remito_id;
  if v_status is distinct from 'firmado' then raise exception 'Este remito no admite encuesta'; end if;
  if v_link.created_at <= now() - interval '60 days' then raise exception 'La encuesta ya cerró'; end if;
  v_general := nullif(p_payload->>'rating_general', '')::smallint;
  if v_general is null or v_general not between 1 and 5 then raise exception 'Elegí una calificación de 1 a 5'; end if;
  v_confirmado := case when jsonb_typeof(p_payload->'cobro_confirmado') = 'boolean' then (p_payload->>'cobro_confirmado')::boolean end;
  v_informado := case when v_confirmado is false and (p_payload->>'cobro_informado') ~ '^\d{1,9}(\.\d{1,2})?$' then (p_payload->>'cobro_informado')::numeric end;
  insert into public.remito_surveys (remito_id, token, rating_general, rating_puntualidad, rating_trato, recomendaria, comentario, cobro_confirmado, cobro_informado)
  values (
    v_link.remito_id, v_link.token, v_general,
    case when (p_payload->>'rating_puntualidad') ~ '^[1-5]$' then (p_payload->>'rating_puntualidad')::smallint end,
    case when (p_payload->>'rating_trato') ~ '^[1-5]$' then (p_payload->>'rating_trato')::smallint end,
    case when p_payload ? 'recomendaria' and jsonb_typeof(p_payload->'recomendaria') = 'boolean' then (p_payload->>'recomendaria')::boolean end,
    nullif(left(btrim(coalesce(p_payload->>'comentario', '')), 1000), ''),
    v_confirmado, v_informado
  )
  on conflict (remito_id) do nothing
  returning survey_id into v_id;
  return jsonb_build_object('ok', true, 'already', v_id is null);
end
$function$;

-- Resumen para Administración/Supervisión. Período por fecha de firma del remito (hora AR).
create or replace function public.get_remito_quality_summary_v1(p_desde date default null, p_hasta date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_desde timestamptz;
  v_hasta timestamptz;
  v jsonb;
begin
  if not (app_private.current_auxilios_role() = any (array['administracion','supervision'])) then
    raise exception 'Sin permiso';
  end if;
  v_desde := coalesce(p_desde, date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires')::date)::timestamp at time zone 'America/Argentina/Buenos_Aires';
  v_hasta := (coalesce(p_hasta, (now() at time zone 'America/Argentina/Buenos_Aires')::date) + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires';

  with base as (
    select r.remito_id, r.nro_remito, r.driver_id, r.razon_social, r.firmado_at, r.operator_service_id,
           coalesce(s.service_order_number, r.nro_servicio) as nro_servicio,
           coalesce(r.imp_total_extras, 0) as cobrado,
           r.pago_1_metodo, r.pago_2_metodo, r.pago_1_monto, r.pago_2_monto,
           l.created_at as link_at, sv.survey_id, sv.rating_general, sv.rating_puntualidad, sv.rating_trato, sv.recomendaria,
           sv.comentario, sv.created_at, sv.cobro_confirmado, sv.cobro_informado, sv.revisado_at, sv.revisado_nota
    from public.remitos r
    left join public.operator_services s on s.service_id = r.operator_service_id
    left join public.remito_public_links l on l.remito_id = r.remito_id
    left join public.remito_surveys sv on sv.remito_id = r.remito_id
    where r.status = 'firmado' and r.firmado_at >= v_desde and r.firmado_at < v_hasta
  ),
  alertas as (
    select b.*, (b.rating_general <= 2) as mala, (b.cobro_confirmado is false) as cobro_mal
    from base b
    where b.survey_id is not null and (b.rating_general <= 2 or b.cobro_confirmado is false)
  )
  select jsonb_build_object(
    'desde', v_desde, 'hasta', v_hasta,
    'totales', (select jsonb_build_object(
        'remitos', count(*),
        'enviados', count(*) filter (where link_at is not null),
        'respondidas', count(*) filter (where survey_id is not null),
        'promedio_general', round(avg(rating_general)::numeric, 2),
        'promedio_puntualidad', round(avg(rating_puntualidad)::numeric, 2),
        'promedio_trato', round(avg(rating_trato)::numeric, 2),
        'recomendarian', count(*) filter (where recomendaria),
        'no_recomendarian', count(*) filter (where recomendaria is false),
        'cobrado_total', coalesce(sum(cobrado), 0),
        'cobrado_efectivo', coalesce(sum(case when pago_1_metodo = 'efectivo' then coalesce(pago_1_monto, cobrado) else 0 end + case when pago_2_metodo = 'efectivo' then coalesce(pago_2_monto, 0) else 0 end), 0),
        'remitos_con_cobro', count(*) filter (where cobrado > 0),
        'cobros_confirmados', count(*) filter (where cobro_confirmado),
        'cobros_no_confirmados', count(*) filter (where cobro_confirmado is false),
        'alertas_pendientes', (select count(*) from alertas a where a.revisado_at is null)
      ) from base),
    'choferes', coalesce((select jsonb_agg(x order by x->>'chofer') from (
        select jsonb_build_object(
          'driver_id', b.driver_id,
          'chofer', coalesce(u.full_name, '—'),
          'remitos', count(*),
          'enviados', count(*) filter (where b.link_at is not null),
          'respondidas', count(*) filter (where b.survey_id is not null),
          'promedio_general', round(avg(b.rating_general)::numeric, 2),
          'promedio_puntualidad', round(avg(b.rating_puntualidad)::numeric, 2),
          'promedio_trato', round(avg(b.rating_trato)::numeric, 2),
          'cobrado_total', coalesce(sum(b.cobrado), 0),
          'cobros_no_confirmados', count(*) filter (where b.cobro_confirmado is false)
        ) as x
        from base b left join public.users u on u.user_id = b.driver_id
        group by b.driver_id, u.full_name
      ) t), '[]'::jsonb),
    'alertas', coalesce((select jsonb_agg(jsonb_build_object(
        'survey_id', a.survey_id, 'remito_id', a.remito_id, 'nro_remito', a.nro_remito, 'nro_servicio', a.nro_servicio,
        'cliente', a.razon_social, 'chofer', coalesce(u.full_name, '—'), 'firmado_at', a.firmado_at, 'respondida_at', a.created_at,
        'rating_general', a.rating_general, 'comentario', a.comentario, 'mala', a.mala,
        'cobro_mal', a.cobro_mal, 'cobrado', a.cobrado, 'cobro_informado', a.cobro_informado,
        'revisado_at', a.revisado_at, 'revisado_nota', a.revisado_nota
      ) order by (a.revisado_at is null) desc, a.created_at desc)
      from alertas a left join public.users u on u.user_id = a.driver_id), '[]'::jsonb),
    'comentarios', coalesce((select jsonb_agg(c order by c->>'respondida_at' desc) from (
        select jsonb_build_object('remito_id', b.remito_id, 'nro_servicio', b.nro_servicio, 'chofer', coalesce(u.full_name, '—'),
                                  'rating_general', b.rating_general, 'comentario', b.comentario, 'respondida_at', b.created_at) c
        from base b left join public.users u on u.user_id = b.driver_id
        where b.comentario is not null order by b.created_at desc limit 30
      ) t), '[]'::jsonb)
  ) into v;
  return v;
end
$function$;

create or replace function public.mark_remito_survey_reviewed_v1(p_survey_id bigint, p_nota text default null)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if app_private.current_auxilios_role() is distinct from 'administracion' then raise exception 'Sin permiso'; end if;
  update public.remito_surveys
     set revisado_at = now(), revisado_por = auth.uid(), revisado_nota = nullif(left(btrim(coalesce(p_nota, '')), 500), '')
   where survey_id = p_survey_id;
  if not found then raise exception 'Encuesta inexistente'; end if;
end
$function$;

revoke all on function public.get_remito_quality_summary_v1(date, date) from public, anon;
grant execute on function public.get_remito_quality_summary_v1(date, date) to authenticated;
revoke all on function public.mark_remito_survey_reviewed_v1(bigint, text) from public, anon;
grant execute on function public.mark_remito_survey_reviewed_v1(bigint, text) to authenticated;
revoke all on function public.submit_remito_survey_v1(text, jsonb) from public;
grant execute on function public.submit_remito_survey_v1(text, jsonb) to anon, authenticated;
