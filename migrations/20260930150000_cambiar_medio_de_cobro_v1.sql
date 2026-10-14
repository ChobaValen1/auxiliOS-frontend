-- Editar un particular: cambiar cómo se pagó (el medio de un cobro ya registrado).
-- Sólo el medio: el monto y la fecha no cambian (para eso se anula y se vuelve a
-- registrar). Sólo Operaciones o Administración, en un servicio que no esté
-- finalizado ni anulado. La nota guarda quién lo cambió y el medio anterior.
create or replace function public.update_service_payment_method_v1(p_payment_id uuid, p_method text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_role text := coalesce(app_private.current_auxilios_role(), '');
  v_pay public.service_payments%rowtype;
  v_status text;
  v_quien text;
begin
  if auth.uid() is null then raise exception 'Sesión requerida'; end if;
  if v_role not in ('operador', 'administracion') then
    raise exception 'Sin permiso para cambiar cómo se pagó';
  end if;
  if coalesce(p_method, '') not in ('cash', 'transfer', 'card', 'mercado_pago', 'other') then
    raise exception 'Elegí el medio de pago';
  end if;
  select * into v_pay from public.service_payments where payment_id = p_payment_id for update;
  if not found or v_pay.voided_at is not null then raise exception 'Cobro inexistente o anulado'; end if;
  select status into v_status from public.operator_services where service_id = v_pay.service_id;
  if v_status in ('completed', 'cancelled') then
    raise exception 'El servicio ya está cerrado: el medio de pago no se puede cambiar';
  end if;
  if v_pay.method = p_method then return app_private.service_balance_v1(v_pay.service_id); end if;
  select coalesce(full_name, email) into v_quien from public.users where user_id = auth.uid();
  update public.service_payments
     set method = p_method,
         note = concat_ws(' · ', nullif(btrim(note), ''),
                format('Medio cambiado de %s por %s el %s', v_pay.method, coalesce(v_quien, 'Operaciones'),
                       to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YY HH24:MI')))
   where payment_id = p_payment_id;
  return app_private.service_balance_v1(v_pay.service_id);
end
$function$;

revoke all on function public.update_service_payment_method_v1(uuid, text) from public, anon;
grant execute on function public.update_service_payment_method_v1(uuid, text) to authenticated;
