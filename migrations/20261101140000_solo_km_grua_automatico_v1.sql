-- AuxiliOS Solo · los km de cada servicio se suman solos a la grúa al firmarse el remito,
-- y se restan si un remito firmado se anula. Funciona también con lo cargado sin señal (lo hace la base al subirse).
create or replace function app_private.solo_truck_km_on_sign() returns trigger language plpgsql security definer set search_path='' as $f$
declare tid uuid; delta numeric:=0;
begin
  if new.status='signed' and old.status is distinct from 'signed' then delta:=coalesce(new.km,0);
  elsif old.status='signed' and new.status='cancelled' then delta:=-coalesce(old.km,0);
  end if;
  if delta=0 then return new; end if;
  tid:=coalesce(new.truck_id,(select id from public.solo_trucks where owner_id=new.owner_id order by created_at limit 1));
  if tid is null then return new; end if;
  update public.solo_trucks set km=greatest(0,coalesce(km,0)+delta) where id=tid and owner_id=new.owner_id;
  return new;
end $f$;
revoke all on function app_private.solo_truck_km_on_sign() from public,anon,authenticated;
drop trigger if exists solo_services_truck_km on public.solo_services;
create trigger solo_services_truck_km after update of status on public.solo_services for each row execute function app_private.solo_truck_km_on_sign();
