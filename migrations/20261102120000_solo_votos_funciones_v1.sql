-- AuxiliOS Solo · votos de «Lo que viene» en la página /gruero (prueba de mercado).
-- Nadie lee ni escribe la tabla directo: solo se suma un voto con la función, y solo para las funciones de la lista.
create table if not exists public.solo_feature_votes(
  id bigint generated always as identity primary key,
  feature text not null check (feature in ('liquidacion','factura_arca','cotizador','cobros','whatsapp_auto')),
  campaign text check (campaign is null or length(campaign)<=80),
  created_at timestamptz not null default now());
alter table public.solo_feature_votes enable row level security;
revoke all on public.solo_feature_votes from anon, authenticated;

create or replace function public.solo_vote_feature_v1(p_feature text, p_campaign text default null) returns boolean
language plpgsql security definer set search_path='' as $f$
begin
  if p_feature not in ('liquidacion','factura_arca','cotizador','cobros','whatsapp_auto') then return false; end if;
  insert into public.solo_feature_votes(feature,campaign) values (p_feature, nullif(left(btrim(coalesce(p_campaign,'')),80),''));
  return true;
end $f$;
revoke all on function public.solo_vote_feature_v1(text,text) from public;
grant execute on function public.solo_vote_feature_v1(text,text) to anon, authenticated;
