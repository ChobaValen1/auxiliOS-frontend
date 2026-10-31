-- AuxiliOS Solo · membrete del remito (CUIT, condición fiscal, logo) y verificación pública por QR.
-- 1) Datos fiscales y logo del gruero.
alter table public.solo_profiles
  add column if not exists cuit text check (cuit is null or cuit ~ '^[0-9]{11}$'),
  add column if not exists tax_condition text check (tax_condition is null or tax_condition in ('monotributo','responsable_inscripto','exento')),
  add column if not exists logo_path text check (logo_path is null or length(logo_path)<=300);

-- 2) Código de verificación de cada remito: lo pone la base y no se puede cambiar.
alter table public.solo_services add column if not exists verify_code text;
update public.solo_services set verify_code=upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)) where verify_code is null;
alter table public.solo_services
  alter column verify_code set default upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),
  alter column verify_code set not null;
create unique index if not exists solo_services_verify_code on public.solo_services(verify_code);

create or replace function app_private.solo_services_before_write() returns trigger language plpgsql security definer set search_path='' as $f$
begin
  if tg_op='INSERT' then
    perform pg_advisory_xact_lock(hashtext('solo_remito:'||new.owner_id::text));
    select coalesce(max(remito_number),0)+1 into new.remito_number from public.solo_services where owner_id=new.owner_id;
    new.verify_code:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
  else
    new.remito_number:=old.remito_number; new.owner_id:=old.owner_id; new.verify_code:=old.verify_code;
  end if;
  new.updated_at:=now();
  return new;
end $f$;
revoke all on function app_private.solo_services_before_write() from public,anon,authenticated;

-- 3) Verificación pública: con el código del QR se confirma que el remito existe y está firmado.
--    Solo datos de comprobación: sin importes, direcciones, teléfonos ni documento; el firmante va abreviado.
create or replace function public.solo_verify_remito_v1(p_code text) returns jsonb
language sql stable security definer set search_path='' as $f$
  select jsonb_build_object(
    'remito_number',s.remito_number,'service_date',s.service_date,'status',s.status,'signed_at',s.signed_at,
    'plate',s.plate,'make_model',s.make_model,'service_type',t.name,
    'client',case when c.kind='particular' then 'Particular' else c.name end,
    'signer',nullif(btrim(split_part(btrim(coalesce(s.signer_name,'')),' ',1)||' '||left(split_part(btrim(coalesce(s.signer_name,'')),' ',2),1)||case when split_part(btrim(coalesce(s.signer_name,'')),' ',2)<>'' then '.' else '' end),''),
    'photos',coalesce(array_length(s.photos,1),0),
    'business',coalesce(p.business_name,p.full_name),'cuit',p.cuit,'tax_condition',p.tax_condition)
  from public.solo_services s
  join public.solo_profiles p on p.owner_id=s.owner_id
  join public.solo_clients c on c.id=s.client_id
  left join public.solo_service_types t on t.id=s.service_type_id
  where s.verify_code=upper(btrim(p_code)) and s.status<>'open' and length(btrim(coalesce(p_code,'')))=12
$f$;
revoke all on function public.solo_verify_remito_v1(text) from public;
grant execute on function public.solo_verify_remito_v1(text) to anon, authenticated;
