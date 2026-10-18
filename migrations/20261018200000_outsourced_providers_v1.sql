-- Tercerizados · paso 1: ficha con datos obligatorios y de pago · 18/10/2026 (autorizado por el dueño)
-- Lista nueva; no toca tablas existentes. Sólo Administración la ve y la edita.
-- Se escribe sólo por la función save_outsourced_provider_v1 (valida CUIT, CBU/CVU y alias); queda auditado.

create or replace function app_private.valid_cuit(p text) returns boolean
language plpgsql immutable set search_path to 'pg_temp' as $function$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g'); w int[] := array[5,4,3,2,7,6,5,4,3,2]; s int := 0; v int;
begin
  if length(d) <> 11 then return false; end if;
  for i in 1..10 loop s := s + substr(d, i, 1)::int * w[i]; end loop;
  v := 11 - (s % 11);
  if v = 11 then v := 0; elsif v = 10 then return false; end if;
  return v = substr(d, 11, 1)::int;
end $function$;

-- CBU: 22 dígitos con sus dos dígitos verificadores. CVU (empieza con 000): 22 dígitos.
create or replace function app_private.valid_cbu(p text) returns boolean
language plpgsql immutable set search_path to 'pg_temp' as $function$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g'); w1 int[] := array[7,1,3,9,7,1,3]; w2 int[] := array[3,9,7,1,3,9,7,1,3,9,7,1,3]; s int := 0;
begin
  if length(d) <> 22 then return false; end if;
  if left(d, 3) = '000' then return true; end if;
  for i in 1..7 loop s := s + substr(d, i, 1)::int * w1[i]; end loop;
  if (10 - s % 10) % 10 <> substr(d, 8, 1)::int then return false; end if;
  s := 0;
  for i in 1..13 loop s := s + substr(d, 8 + i, 1)::int * w2[i]; end loop;
  return (10 - s % 10) % 10 = substr(d, 22, 1)::int;
end $function$;

create table if not exists public.outsourced_providers (
  provider_id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(btrim(display_name)) between 2 and 80),
  legal_name text not null check (char_length(btrim(legal_name)) between 2 and 120),
  cuit text not null check (cuit ~ '^\d{11}$'),
  iva_condition text not null check (iva_condition in ('responsable_inscripto', 'monotributo', 'exento')),
  contact_name text not null check (char_length(btrim(contact_name)) between 2 and 80),
  contact_phone text not null check (char_length(regexp_replace(contact_phone, '\D', '', 'g')) between 8 and 15),
  cbu text check (cbu ~ '^\d{22}$'),
  payment_alias text check (payment_alias ~ '^[a-z0-9.-]{6,20}$'),
  account_holder text,
  invoicing_mode text not null default 'monthly' check (invoicing_mode in ('per_service', 'monthly')),
  payment_term_days integer not null default 15 check (payment_term_days between 0 and 180),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint outsourced_providers_payment_check check (cbu is not null or payment_alias is not null),
  constraint outsourced_providers_cuit_key unique (cuit)
);

alter table public.outsourced_providers enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'outsourced_providers' and policyname = 'outsourced_providers_select_admin') then
    create policy outsourced_providers_select_admin on public.outsourced_providers for select to authenticated
      using ((select app_private.current_auxilios_role()) = 'administracion');
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'outsourced_providers_audit' and tgrelid = 'public.outsourced_providers'::regclass) then
    create trigger outsourced_providers_audit after insert or delete or update on public.outsourced_providers
      for each row execute function public.capture_audit_event('provider_id');
  end if;
end $$;
revoke all on public.outsourced_providers from anon;
grant select on public.outsourced_providers to authenticated;

-- Crear (p_provider_id null) o editar. Devuelve la ficha guardada.
create or replace function public.save_outsourced_provider_v1(p_provider_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path to 'public', 'app_private', 'pg_temp' as $function$
declare
  v_role text := app_private.current_auxilios_role();
  p jsonb := coalesce(p_payload, '{}'::jsonb);
  v_display text := btrim(coalesce(p->>'display_name', ''));
  v_legal text := btrim(coalesce(p->>'legal_name', ''));
  v_cuit text := regexp_replace(coalesce(p->>'cuit', ''), '\D', '', 'g');
  v_iva text := nullif(btrim(coalesce(p->>'iva_condition', '')), '');
  v_contact text := btrim(coalesce(p->>'contact_name', ''));
  v_phone text := btrim(coalesce(p->>'contact_phone', ''));
  v_cbu text := nullif(regexp_replace(coalesce(p->>'cbu', ''), '\D', '', 'g'), '');
  v_alias text := nullif(lower(btrim(coalesce(p->>'payment_alias', ''))), '');
  v_holder text := nullif(btrim(coalesce(p->>'account_holder', '')), '');
  v_mode text := coalesce(nullif(btrim(coalesce(p->>'invoicing_mode', '')), ''), 'monthly');
  v_days integer := coalesce(nullif(p->>'payment_term_days', '')::integer, 15);
  v_active boolean := coalesce((p->>'is_active')::boolean, true);
  v_row public.outsourced_providers%rowtype;
  v_other text;
begin
  if v_role <> 'administracion' then raise exception 'Sólo Administración puede cargar tercerizados' using errcode = '42501'; end if;
  if jsonb_typeof(p) <> 'object' then raise exception 'Datos inválidos'; end if;
  if char_length(v_display) < 2 then raise exception 'Indicá el nombre del tercerizado'; end if;
  if char_length(v_legal) < 2 then raise exception 'Indicá la razón social'; end if;
  if not app_private.valid_cuit(v_cuit) then raise exception 'El CUIT no es válido: revisá los 11 números'; end if;
  if v_iva is null or v_iva not in ('responsable_inscripto', 'monotributo', 'exento') then raise exception 'Elegí la condición frente al IVA'; end if;
  if char_length(v_contact) < 2 then raise exception 'Indicá el nombre del responsable'; end if;
  if char_length(regexp_replace(v_phone, '\D', '', 'g')) not between 8 and 15 then raise exception 'El teléfono tiene que tener entre 8 y 15 números'; end if;
  if v_cbu is null and v_alias is null then raise exception 'Para pagarle hace falta el CBU/CVU o el alias'; end if;
  if v_cbu is not null and not app_private.valid_cbu(v_cbu) then raise exception 'El CBU/CVU no es válido: revisá los 22 números'; end if;
  if v_alias is not null and v_alias !~ '^[a-z0-9.-]{6,20}$' then raise exception 'El alias tiene entre 6 y 20 letras, números, puntos o guiones'; end if;
  if v_mode not in ('per_service', 'monthly') then raise exception 'Cómo factura: por servicio o mensual'; end if;
  if v_days not between 0 and 180 then raise exception 'El plazo de pago va de 0 a 180 días'; end if;

  select display_name into v_other from public.outsourced_providers
  where cuit = v_cuit and provider_id is distinct from p_provider_id;
  if found then raise exception 'Ya hay un tercerizado con ese CUIT: %', v_other; end if;

  if p_provider_id is null then
    insert into public.outsourced_providers(display_name, legal_name, cuit, iva_condition, contact_name, contact_phone,
      cbu, payment_alias, account_holder, invoicing_mode, payment_term_days, is_active, created_by, updated_by)
    values (v_display, v_legal, v_cuit, v_iva, v_contact, v_phone, v_cbu, v_alias, v_holder, v_mode, v_days, v_active, auth.uid(), auth.uid())
    returning * into v_row;
  else
    update public.outsourced_providers set display_name = v_display, legal_name = v_legal, cuit = v_cuit, iva_condition = v_iva,
      contact_name = v_contact, contact_phone = v_phone, cbu = v_cbu, payment_alias = v_alias, account_holder = v_holder,
      invoicing_mode = v_mode, payment_term_days = v_days, is_active = v_active, updated_at = now(), updated_by = auth.uid()
    where provider_id = p_provider_id
    returning * into v_row;
    if not found then raise exception 'El tercerizado no existe'; end if;
  end if;
  return to_jsonb(v_row);
end $function$;
revoke all on function public.save_outsourced_provider_v1(uuid, jsonb) from public, anon;
grant execute on function public.save_outsourced_provider_v1(uuid, jsonb) to authenticated;
