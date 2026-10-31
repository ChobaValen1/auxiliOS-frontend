-- AuxiliOS Solo v1 · tablas propias para el gruero que trabaja solo (solo en la base de Solo, no en Flota).
-- Cada fila pertenece a un gruero (owner_id) y una regla por tabla deja ver y cambiar solo lo propio.

create table public.solo_profiles(
  owner_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) between 2 and 120),
  business_name text check (business_name is null or length(business_name)<=120),
  phone text check (phone is null or length(phone)<=40),
  created_at timestamptz not null default now()
);

create table public.solo_trucks(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plate text not null check (length(btrim(plate)) between 5 and 12),
  brand text, model text,
  km numeric check (km is null or km>=0),
  created_at timestamptz not null default now()
);

-- Prestadoras y «Particular». payment_days: plazo en que suele pagar.
create table public.solo_clients(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 120),
  kind text not null default 'prestadora' check (kind in ('prestadora','particular')),
  payment_days integer not null default 30 check (payment_days between 0 and 365),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);
create unique index solo_clients_owner_name on public.solo_clients(owner_id, lower(btrim(name)));

create table public.solo_service_types(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 80),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index solo_service_types_owner_name on public.solo_service_types(owner_id, lower(btrim(name)));

-- Tarifa de un tipo de servicio para un cliente, con vigencia. extras: [{name, amount, unit:'fijo'|'hora'|'unidad'}]
create table public.solo_rates(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id uuid not null references public.solo_clients(id) on delete cascade,
  service_type_id uuid not null references public.solo_service_types(id) on delete cascade,
  base_amount numeric not null default 0 check (base_amount>=0),
  included_km numeric not null default 0 check (included_km>=0),
  per_km numeric not null default 0 check (per_km>=0),
  extras jsonb not null default '[]' check (jsonb_typeof(extras)='array'),
  valid_from date not null default current_date,
  created_at timestamptz not null default now(),
  unique (client_id, service_type_id, valid_from)
);

-- Un servicio con su remito: los mismos datos que el remito de AuxiliOS Flota.
create table public.solo_services(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  remito_number integer,
  client_id uuid not null references public.solo_clients(id),
  service_type_id uuid references public.solo_service_types(id),
  truck_id uuid references public.solo_trucks(id) on delete set null,
  service_date timestamptz not null default now(),
  provider_order text,
  customer_name text, customer_doc text, customer_phone text, customer_email text,
  plate text, make_model text,
  origin text, destination text,
  km numeric check (km is null or km>=0),
  tolls jsonb not null default '[]' check (jsonb_typeof(tolls)='array'),
  extras jsonb not null default '[]' check (jsonb_typeof(extras)='array'),
  other_amount numeric not null default 0 check (other_amount>=0),
  base_amount numeric not null default 0 check (base_amount>=0),
  km_amount numeric not null default 0 check (km_amount>=0),
  extras_amount numeric not null default 0 check (extras_amount>=0),
  total numeric not null default 0 check (total>=0),
  arrived_at timestamptz,
  photos text[] not null default '{}',
  signature_path text, signed_at timestamptz, signer_name text, signer_doc text,
  conf_service boolean, conf_charges boolean, conf_tow boolean, no_damage boolean, customer_present boolean,
  notes text,
  payment_1_method text check (payment_1_method is null or payment_1_method in ('cash','transfer','card','mercado_pago','other')),
  payment_1_amount numeric check (payment_1_amount is null or payment_1_amount>=0),
  payment_2_method text check (payment_2_method is null or payment_2_method in ('cash','transfer','card','mercado_pago','other')),
  payment_2_amount numeric check (payment_2_amount is null or payment_2_amount>=0),
  status text not null default 'open' check (status in ('open','signed','cancelled')),
  paid_at timestamptz,
  invoiced_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, remito_number)
);
create index solo_services_owner_date on public.solo_services(owner_id, service_date desc);

-- Gastos fijos (con período en meses, se reparten por mes) y variables (del día).
create table public.solo_expenses(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('fixed','variable')),
  category text not null check (length(btrim(category)) between 2 and 60),
  amount numeric not null check (amount>0),
  spent_on date not null default current_date,
  period_months integer check (period_months is null or period_months in (1,2,3,6,12)),
  ends_on date,
  notes text,
  receipt_path text,
  created_at timestamptz not null default now(),
  check ((kind='fixed' and period_months is not null) or (kind='variable' and period_months is null))
);
create index solo_expenses_owner_date on public.solo_expenses(owner_id, spent_on desc);

-- Número de remito correlativo por gruero, y fecha de actualización.
create or replace function app_private.solo_services_before_write() returns trigger language plpgsql security definer set search_path='' as $f$
begin
  if tg_op='INSERT' then
    perform pg_advisory_xact_lock(hashtext('solo_remito:'||new.owner_id::text));
    select coalesce(max(remito_number),0)+1 into new.remito_number from public.solo_services where owner_id=new.owner_id;
  else
    new.remito_number:=old.remito_number; new.owner_id:=old.owner_id;
  end if;
  new.updated_at:=now();
  return new;
end $f$;
revoke all on function app_private.solo_services_before_write() from public,anon,authenticated;
create trigger solo_services_before_write before insert or update on public.solo_services
  for each row execute function app_private.solo_services_before_write();

-- Reglas de acceso: cada gruero ve y cambia solo lo suyo.
do $rls$ declare t text; begin
  foreach t in array array['solo_profiles','solo_trucks','solo_clients','solo_service_types','solo_rates','solo_services','solo_expenses'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t||'_own', t);
  end loop;
end $rls$;

-- Una tarifa y un servicio solo pueden apuntar a clientes y tipos del mismo gruero.
create or replace function app_private.solo_same_owner() returns trigger language plpgsql security definer set search_path='' as $f$
begin
  if new.client_id is not null and not exists(select 1 from public.solo_clients c where c.id=new.client_id and c.owner_id=new.owner_id) then raise exception 'Cliente inexistente'; end if;
  if new.service_type_id is not null and not exists(select 1 from public.solo_service_types s where s.id=new.service_type_id and s.owner_id=new.owner_id) then raise exception 'Tipo de servicio inexistente'; end if;
  if nullif(to_jsonb(new)->>'truck_id','') is not null and not exists(select 1 from public.solo_trucks k where k.id=(to_jsonb(new)->>'truck_id')::uuid and k.owner_id=new.owner_id) then raise exception 'Grúa inexistente'; end if;
  return new;
end $f$;
revoke all on function app_private.solo_same_owner() from public,anon,authenticated;
create trigger solo_rates_same_owner before insert or update on public.solo_rates for each row execute function app_private.solo_same_owner();
create trigger solo_services_same_owner before insert or update on public.solo_services for each row execute function app_private.solo_same_owner();

-- Resumen del mes: facturé, gasté, me queda; cobrado y por cobrar. Corre con los permisos del gruero.
create or replace function public.solo_month_summary_v1(p_month date default null)
returns jsonb language sql stable security invoker set search_path='' as $f$
  with m as (select date_trunc('month',coalesce(p_month,(now() at time zone 'America/Argentina/Buenos_Aires')::date))::date d),
  r as (select d, (d+interval '1 month')::date e from m),
  s as (select x.* from public.solo_services x, r where x.status<>'cancelled'
        and (x.service_date at time zone 'America/Argentina/Buenos_Aires')::date>=r.d and (x.service_date at time zone 'America/Argentina/Buenos_Aires')::date<r.e),
  v as (select coalesce(sum(x.amount),0) t from public.solo_expenses x, r where x.kind='variable' and x.spent_on>=r.d and x.spent_on<r.e),
  f as (select coalesce(sum(round(x.amount/x.period_months,2)),0) t from public.solo_expenses x, r where x.kind='fixed'
        and x.spent_on<r.e and (x.ends_on is null or x.ends_on>=r.d)
        and x.spent_on>(r.d - make_interval(months=>x.period_months))::date)
  select jsonb_build_object(
    'month',(select d from r),
    'services',(select count(*) from s),
    'billed',(select coalesce(sum(total),0) from s),
    'collected',(select coalesce(sum(total),0) from s where paid_at is not null),
    'pending',(select coalesce(sum(total),0) from s where paid_at is null),
    'variable_expenses',(select t from v),
    'fixed_expenses',(select t from f),
    'spent',(select t from v)+(select t from f),
    'left',(select coalesce(sum(total),0) from s)-(select t from v)-(select t from f));
$f$;
revoke all on function public.solo_month_summary_v1(date) from public,anon;
grant execute on function public.solo_month_summary_v1(date) to authenticated;

-- Archivos (fotos, firmas, tickets): carpeta privada por gruero, solo_files/<owner_id>/...
insert into storage.buckets(id,name,public) values('solo_files','solo_files',false) on conflict (id) do nothing;
create policy solo_files_own on storage.objects for all to authenticated
  using (bucket_id='solo_files' and (storage.foldername(name))[1]=(select auth.uid())::text)
  with check (bucket_id='solo_files' and (storage.foldername(name))[1]=(select auth.uid())::text);
