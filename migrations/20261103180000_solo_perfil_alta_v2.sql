-- Monogrúas · alta v2: lo que contamos del gruero al crear la cuenta (zona, cómo trabaja, con quién y cómo nos conoció).
-- Base de monogrúas (yxmzcjvigaddvjfiwlvz). Cada gruero ve y edita solo su perfil (política solo_profiles_own).
alter table public.solo_profiles
  add column if not exists province text,
  add column if not exists city text,
  add column if not exists fleet_size text,
  add column if not exists tow_types text[],
  add column if not exists drivers_mode text,
  add column if not exists years_in_trade text,
  add column if not exists monthly_services text,
  add column if not exists providers text[],
  add column if not exists providers_other text,
  add column if not exists current_tools text[],
  add column if not exists pains text[],
  add column if not exists heard_from text,
  add column if not exists onboarding_version smallint;

alter table public.solo_profiles drop constraint if exists solo_profiles_alta_v2_chk;
alter table public.solo_profiles add constraint solo_profiles_alta_v2_chk check (
  (province is null or length(province) <= 60) and (city is null or length(city) <= 80)
  and (fleet_size is null or fleet_size in ('1','2','3-5','6+'))
  and (drivers_mode is null or drivers_mode in ('solo','con_choferes','solo_choferes'))
  and (years_in_trade is null or years_in_trade in ('<1','1-3','3-10','10+'))
  and (monthly_services is null or monthly_services in ('<20','20-50','50-100','100+'))
  and (heard_from is null or heard_from in ('facebook','instagram','tiktok','google','otro_gruero','prestadora','otro'))
  and (providers_other is null or length(providers_other) <= 200)
  and coalesce(cardinality(tow_types),0) <= 10 and coalesce(cardinality(providers),0) <= 20
  and coalesce(cardinality(current_tools),0) <= 10 and coalesce(cardinality(pains),0) <= 10
);
