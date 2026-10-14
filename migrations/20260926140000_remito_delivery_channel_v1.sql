-- Envío del remito al cliente: obligatorio al firmar.
--
-- Al firmar, el chofer tiene que elegir: enviarlo por WhatsApp, compartir el
-- PDF o marcar que el cliente no tiene WhatsApp. Se registra el canal para
-- medir la cobertura real del control de cobro y de la encuesta.
--
-- · remito_public_links.canal / canal_at ('whatsapp' | 'compartido' | 'sin_whatsapp').
-- · register_remito_delivery_v1: crea o reusa el link y guarda el canal
--   (Administración/Supervisión o el chofer dueño del remito).
-- · get_remito_quality_summary_v1: "enviados" ya no cuenta los sin WhatsApp y
--   se suma 'sin_whatsapp' a los totales y por chofer.

alter table public.remito_public_links
  add column if not exists canal text check (canal is null or canal in ('whatsapp','compartido','sin_whatsapp')),
  add column if not exists canal_at timestamptz;

comment on column public.remito_public_links.canal is 'Cómo se entregó el remito al cliente al firmar: whatsapp, compartido (PDF) o sin_whatsapp.';

create or replace function public.register_remito_delivery_v1(p_remito_id integer, p_canal text)
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
  if p_canal is null or p_canal not in ('whatsapp','compartido','sin_whatsapp') then raise exception 'Canal inválido'; end if;
  select r.driver_id into v_driver from public.remitos r where r.remito_id = p_remito_id;
  if not found then raise exception 'Remito inexistente'; end if;
  if not (app_private.current_auxilios_role() = any (array['administracion','supervision'])
          or v_driver = auth.uid()) then
    raise exception 'Sin permiso para este remito';
  end if;
  insert into public.remito_public_links (remito_id, created_by, canal, canal_at)
  values (p_remito_id, auth.uid(), p_canal, now())
  on conflict (remito_id) do update
    set canal = case when public.remito_public_links.canal in ('whatsapp','compartido') and excluded.canal = 'sin_whatsapp'
                     then public.remito_public_links.canal else excluded.canal end,
        canal_at = now(),
        expires_at = greatest(public.remito_public_links.expires_at, now() + interval '180 days')
  returning token into v_token;
  return v_token;
end
$function$;

revoke all on function public.register_remito_delivery_v1(integer, text) from public, anon;
grant execute on function public.register_remito_delivery_v1(integer, text) to authenticated;

do $migration$
declare v_sql text; v_before text;
begin
  select pg_get_functiondef('public.get_remito_quality_summary_v1(date,date)'::regprocedure) into v_sql;
  v_before := v_sql;
  v_sql := replace(v_sql, 'l.created_at as link_at,', 'l.created_at as link_at, l.canal,');
  v_sql := replace(v_sql, $a$'enviados', count(*) filter (where link_at is not null),$a$,
                          $a$'enviados', count(*) filter (where link_at is not null and coalesce(canal, '') <> 'sin_whatsapp'),
        'sin_whatsapp', count(*) filter (where canal = 'sin_whatsapp'),$a$);
  v_sql := replace(v_sql, $a$'enviados', count(*) filter (where b.link_at is not null),$a$,
                          $a$'enviados', count(*) filter (where b.link_at is not null and coalesce(b.canal, '') <> 'sin_whatsapp'),
          'sin_whatsapp', count(*) filter (where b.canal = 'sin_whatsapp'),$a$);
  if v_sql = v_before or position('sin_whatsapp' in v_sql) = 0 or position('l.canal' in v_sql) = 0 then
    raise exception 'get_remito_quality_summary_v1: no se encontraron los puntos de reemplazo';
  end if;
  execute v_sql;
end
$migration$;
