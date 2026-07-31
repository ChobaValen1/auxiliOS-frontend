-- AuxiliOS · Fase 2A.1: inicialización, RLS, auditoría y permisos

insert into public.company_rate_rules
(rate_card_id,rule_type,enabled,calculation_mode,amount,start_time,end_time,saturday_start,saturday_end,sunday_holiday_start,sunday_holiday_end)
select rc.rate_card_id,x.t,false,'percentage',
 case when x.t in('night','weekend_holiday') then 20 else 0 end,
 case when x.t='night' then '21:59'::time end,
 case when x.t='night' then '05:59'::time end,
 case when x.t='weekend_holiday' then '21:59'::time end,
 case when x.t='weekend_holiday' then '05:59'::time end,
 case when x.t='weekend_holiday' then '21:59'::time end,
 case when x.t='weekend_holiday' then '05:59'::time end
from public.company_rate_cards rc cross join(values('night'),('weekend_holiday'),('wide_coverage'))x(t)
on conflict(rate_card_id,rule_type) do nothing;

insert into public.company_rate_billing_settings(rate_card_id)
select rate_card_id from public.company_rate_cards on conflict(rate_card_id) do nothing;

insert into public.company_rate_codes(rate_card_id,code_key,enabled)
select rc.rate_card_id,x.k,x.e from public.company_rate_cards rc cross join(values
 ('traveler',true),('work',false),('toll',false),('wait',true),('osa',false),
 ('extraction',true),('storage',true),('excess',true),('special',true))x(k,e)
on conflict(rate_card_id,code_key) do nothing;

drop trigger if exists company_rate_cards_initialize_engine on public.company_rate_cards;
create trigger company_rate_cards_initialize_engine after insert on public.company_rate_cards
for each row execute function app_private.initialize_rate_card_engine();

drop trigger if exists service_concepts_touch_updated_at on public.service_concepts;
create trigger service_concepts_touch_updated_at before update on public.service_concepts
for each row execute function app_private.touch_company_record();

do $$
declare t text;
begin
 foreach t in array array[
  'company_rate_service_links','company_rate_rules','company_rate_rule_exceptions',
  'company_rate_billing_settings','company_rate_codes'
 ] loop
  execute format('drop trigger if exists %I_validate on public.%I',t,t);
  execute format('create trigger %I_validate before insert or update or delete on public.%I for each row execute function app_private.validate_rate_card_engine_child()',t,t);
 end loop;
 foreach t in array array[
  'company_rate_service_links','company_rate_rules','company_rate_billing_settings','company_rate_codes'
 ] loop
  execute format('drop trigger if exists %I_touch on public.%I',t,t);
  execute format('create trigger %I_touch before update on public.%I for each row execute function app_private.touch_company_record()',t,t);
 end loop;
end $$;

drop trigger if exists service_concepts_audit on public.service_concepts;
create trigger service_concepts_audit after insert or update or delete on public.service_concepts
for each row execute function public.capture_audit_event('concept_id');
drop trigger if exists company_rate_service_links_audit on public.company_rate_service_links;
create trigger company_rate_service_links_audit after insert or update or delete on public.company_rate_service_links
for each row execute function public.capture_audit_event('link_id');
drop trigger if exists company_rate_rules_audit on public.company_rate_rules;
create trigger company_rate_rules_audit after insert or update or delete on public.company_rate_rules
for each row execute function public.capture_audit_event('rule_id');
drop trigger if exists company_rate_rule_exceptions_audit on public.company_rate_rule_exceptions;
create trigger company_rate_rule_exceptions_audit after insert or update or delete on public.company_rate_rule_exceptions
for each row execute function public.capture_audit_event('exception_id');
drop trigger if exists company_rate_billing_settings_audit on public.company_rate_billing_settings;
create trigger company_rate_billing_settings_audit after insert or update or delete on public.company_rate_billing_settings
for each row execute function public.capture_audit_event('rate_card_id');
drop trigger if exists company_rate_codes_audit on public.company_rate_codes;
create trigger company_rate_codes_audit after insert or update or delete on public.company_rate_codes
for each row execute function public.capture_audit_event('code_id');

alter table public.service_concepts enable row level security;
alter table public.company_rate_service_links enable row level security;
alter table public.company_rate_rules enable row level security;
alter table public.company_rate_rule_exceptions enable row level security;
alter table public.company_rate_billing_settings enable row level security;
alter table public.company_rate_codes enable row level security;

revoke all on public.service_concepts,public.company_rate_service_links,public.company_rate_rules,
 public.company_rate_rule_exceptions,public.company_rate_billing_settings,public.company_rate_codes from anon;
grant select,insert,update on public.service_concepts to authenticated;
grant select,insert,update,delete on public.company_rate_service_links,public.company_rate_rules,
 public.company_rate_rule_exceptions,public.company_rate_billing_settings,public.company_rate_codes to authenticated;

drop policy if exists service_concepts_select_management on public.service_concepts;
create policy service_concepts_select_management on public.service_concepts for select to authenticated
using(app_private.current_auxilios_role()=any(array['administracion','supervision']));
drop policy if exists service_concepts_insert_admin on public.service_concepts;
create policy service_concepts_insert_admin on public.service_concepts for insert to authenticated
with check(app_private.current_auxilios_role()='administracion');
drop policy if exists service_concepts_update_admin on public.service_concepts;
create policy service_concepts_update_admin on public.service_concepts for update to authenticated
using(app_private.current_auxilios_role()='administracion')
with check(app_private.current_auxilios_role()='administracion');

do $$
declare t text;
begin
 foreach t in array array[
  'company_rate_service_links','company_rate_rules','company_rate_rule_exceptions',
  'company_rate_billing_settings','company_rate_codes'
 ] loop
  execute format('drop policy if exists %I_select_management on public.%I',t,t);
  execute format('create policy %I_select_management on public.%I for select to authenticated using(app_private.current_auxilios_role()=any(array[''administracion'',''supervision'']))',t,t);
  execute format('drop policy if exists %I_insert_admin on public.%I',t,t);
  execute format('create policy %I_insert_admin on public.%I for insert to authenticated with check(app_private.current_auxilios_role()=''administracion'' and app_private.rate_card_is_draft(rate_card_id))',t,t);
  execute format('drop policy if exists %I_update_admin on public.%I',t,t);
  execute format('create policy %I_update_admin on public.%I for update to authenticated using(app_private.current_auxilios_role()=''administracion'' and app_private.rate_card_is_draft(rate_card_id)) with check(app_private.current_auxilios_role()=''administracion'' and app_private.rate_card_is_draft(rate_card_id))',t,t);
  execute format('drop policy if exists %I_delete_admin on public.%I',t,t);
  execute format('create policy %I_delete_admin on public.%I for delete to authenticated using(app_private.current_auxilios_role()=''administracion'' and app_private.rate_card_is_draft(rate_card_id))',t,t);
 end loop;
end $$;

comment on table public.service_concepts is 'Catálogo de conceptos primarios, secundarios y mixtos.';
comment on table public.company_rate_service_links is 'Precios secundarios diferenciados por concepto principal.';
comment on table public.company_rate_rules is 'Reglas de nocturnidad, fin de semana/feriado y cobertura amplia.';
comment on table public.company_rate_rule_exceptions is 'Conceptos exceptuados de recargos.';
comment on table public.company_rate_billing_settings is 'Copago y peajes del tarifario.';
comment on table public.company_rate_codes is 'Códigos operativos habilitados.';
