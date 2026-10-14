CREATE OR REPLACE FUNCTION app_private.guard_operator_service_document_billing_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
begin
  if new.status='completed'
     and new.billing_status in ('pending','reviewed','invoiced')
     and new.document_status not in ('approved','exception_approved') then
    new.billing_status:='not_ready';
  end if;
  return new;
end;
$function$;
create trigger document_guard before update on operator_services for each row execute function app_private.guard_operator_service_document_billing_v1();
