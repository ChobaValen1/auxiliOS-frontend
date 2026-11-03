-- Monogrúas · alta v2: «¿Cómo nos conociste?» admite varias respuestas y la grúa guarda el año (opcional).
alter table public.solo_profiles drop constraint if exists solo_profiles_alta_v2_chk;
alter table public.solo_profiles alter column heard_from type text[] using case when heard_from is null then null else array[heard_from] end;
alter table public.solo_profiles add constraint solo_profiles_alta_v2_chk check (
  (province is null or length(province) <= 60) and (city is null or length(city) <= 80)
  and (fleet_size is null or fleet_size in ('1','2','3-5','6+'))
  and (drivers_mode is null or drivers_mode in ('solo','con_choferes','solo_choferes'))
  and (years_in_trade is null or years_in_trade in ('<1','1-3','3-10','10+'))
  and (monthly_services is null or monthly_services in ('<20','20-50','50-100','100+'))
  and (heard_from is null or heard_from <@ array['facebook','instagram','tiktok','google','otro_gruero','prestadora','otro'])
  and (providers_other is null or length(providers_other) <= 200)
  and coalesce(cardinality(tow_types),0) <= 10 and coalesce(cardinality(providers),0) <= 20
  and coalesce(cardinality(current_tools),0) <= 10 and coalesce(cardinality(pains),0) <= 10);
alter table public.solo_trucks add column if not exists year smallint;
alter table public.solo_trucks drop constraint if exists solo_trucks_year_chk;
alter table public.solo_trucks add constraint solo_trucks_year_chk check (year is null or year between 1960 and 2100);
