-- Explicit operational responsibility and absence of collection; no historical rewrite.
alter table public.operator_service_excess_charges drop constraint operator_service_excess_charges_payer_agent_check;
alter table public.operator_service_excess_charges add constraint operator_service_excess_charges_payer_agent_check check(payer_agent in ('customer','provider'));
alter table public.operator_service_excess_charges drop constraint operator_service_excess_charges_customer_payment_method_check;
alter table public.operator_service_excess_charges add constraint operator_service_excess_charges_customer_payment_method_check check(customer_payment_method in ('cash','transfer','card','mercado_pago','other','not_collected'));
alter table public.operator_service_excess_charges drop constraint operator_service_excess_collector_chk;
alter table public.operator_service_excess_charges add constraint operator_service_excess_collector_chk check((collector_agent='provider' and customer_payment_method is null) or (collector_agent='company' and customer_payment_method in ('cash','transfer','card','mercado_pago','other','not_collected')));
