-- AuxiliOS · matriz comercial definitiva de Peajes y Excedentes
-- collector_agent identifica quién efectivamente cobró el excedente:
-- company = Empresa (nosotros), provider = Prestadora.

alter table public.operator_service_excess_charges
  add column if not exists collector_agent text;

-- Los registros anteriores sólo podían persistirse con un medio de pago del cliente,
-- por lo que corresponden al caso histórico "Empresa (Nosotros)".
update public.operator_service_excess_charges
set collector_agent='company'
where collector_agent is null;

-- Si cobra la Prestadora el medio de pago no aplica y debe poder ser NULL.
alter table public.operator_service_excess_charges
  alter column customer_payment_method drop not null,
  alter column collector_agent set default 'company',
  alter column collector_agent set not null;

do $$
begin
  if exists(select 1 from pg_constraint where conname='operator_service_excess_collector_chk') then
    alter table public.operator_service_excess_charges drop constraint operator_service_excess_collector_chk;
  end if;
  alter table public.operator_service_excess_charges add constraint operator_service_excess_collector_chk
    check (
      (collector_agent='provider' and customer_payment_method is null)
      or (collector_agent='company' and customer_payment_method in ('cash','transfer','card','mercado_pago','other'))
    );
end $$;

drop index if exists public.operator_service_excess_unique_business_charge;
create unique index operator_service_excess_unique_business_charge
on public.operator_service_excess_charges(
  service_id,
  concept_id,
  unit_amount,
  collector_agent,
  coalesce(customer_payment_method,'n/a')
);
