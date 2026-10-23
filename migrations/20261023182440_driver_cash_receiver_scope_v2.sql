-- Cash custody follows the recorded receiver, even if another driver did the
-- service or there is no recoverable assignment. Never charge Administration's receipts.
do $mig$
declare d text; a text:=$a$from public.service_payments p join services s using(service_id)
    where p.received_by=p_driver$a$;
begin
  d:=pg_get_functiondef('app_private.monthly_cash_source_v2(uuid,integer)'::regprocedure);
  if position('Cash receiver scope v2' in d)=0 then
    if (length(d)-length(replace(d,a,'')))/length(a)<>1 then raise exception 'monthly cash receiver: anchor changed'; end if;
    execute replace(d,a,$b$from public.service_payments p join public.operator_services s using(service_id)
    -- Cash receiver scope v2: identity comes from the payment, not the assignment.
    where s.status='completed' and s.logistics_type='own' and p.received_by=p_driver$b$);
  end if;
end $mig$;
