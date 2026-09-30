-- Un servicio finalizado o anulado ya no recibe cobros: el saldo de un particular
-- se registra antes de finalizarlo (finalizar con saldo ya estaba bloqueado).
-- Al aplicarlo no había ningún particular cerrado con saldo pendiente.
do $$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef('public.register_service_payment_v1(uuid,text,numeric,text,text)'::regprocedure) into v_def;
  if v_def like '%El servicio ya está cerrado%' then return; end if;
  v_new := replace(v_def,
    $old$  if p_kind not in ('sena', 'saldo') then raise exception 'Tipo de cobro inválido'; end if;$old$,
    $new$  if v_s.status in ('completed', 'cancelled') then
    raise exception 'El servicio ya está cerrado: los cobros se registran antes de finalizarlo';
  end if;
  if p_kind not in ('sena', 'saldo') then raise exception 'Tipo de cobro inválido'; end if;$new$);
  if v_new = v_def then raise exception 'register_service_payment_v1 no tiene el texto esperado'; end if;
  execute v_new;
end
$$;
