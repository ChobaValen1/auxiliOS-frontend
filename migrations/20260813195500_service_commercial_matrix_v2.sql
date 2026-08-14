-- AuxiliOS · matriz comercial definitiva de Peajes y Excedentes

alter table public.operator_service_excess_charges
  add column if not exists collector_agent text;

do $$
begin
  if not exists(select 1 from pg_constraint where conname='operator_service_excess_collector_chk') then
    alter table public.operator_service_excess_charges add constraint operator_service_excess_collector_chk
      check (
        collector_agent is null
        or (collector_agent='provider' and customer_payment_method is null)
        or (collector_agent='company' and customer_payment_method in ('cash','transfer','card','mercado_pago','other'))
      );
  end if;
end $$;

drop index if exists public.operator_service_excess_unique_business_charge;
create unique index operator_service_excess_unique_business_charge
on public.operator_service_excess_charges(
  service_id,
  concept_id,
  unit_amount,
  coalesce(customer_payment_method,'n/a'),
  coalesce(collector_agent,'unregistered')
);
