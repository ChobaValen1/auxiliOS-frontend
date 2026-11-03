-- Rendición y aprobación de sueldos (caso: recibo aprobado sin rendición; después se cargó $0 y no se descontó).
-- 1) No se puede aprobar un recibo si falta cargar la rendición del mes y hay efectivo a presentar.
--    Cargar $0 cuenta como rendición cargada (no rindió nada → se descuenta todo).
-- 2) Si se carga o cambia la rendición de un recibo APROBADO (no pagado) y eso cambia el descuento,
--    el recibo vuelve a pendiente y se recalcula; queda registrado en payroll_eventos.

create or replace function public.payroll_aprobar_v1(p_ids uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $f$
declare v_uid uuid:=auth.uid(); r record; ok int:=0; saltadas jsonb:='[]'; v_cash jsonb;
begin
  if v_uid is null or coalesce(app_private.current_auxilios_role(),'')<>'administracion' then raise exception 'No autorizado'; end if;
  if coalesce(array_length(p_ids,1),0)=0 or array_length(p_ids,1)>500 then raise exception 'Elegí entre 1 y 500 recibos.'; end if;
  for r in select * from public.payroll_liquidaciones where liquidacion_id=any(p_ids) order by liquidacion_id for update loop
    if r.estado<>'pendiente' then saltadas:=saltadas||jsonb_build_object('liquidacion_id',r.liquidacion_id,'motivo','Ya está '||r.estado); continue; end if;
    if r.review_required then saltadas:=saltadas||jsonb_build_object('liquidacion_id',r.liquidacion_id,'motivo','Cambió la información: recalculá antes de aprobar'); continue; end if;
    v_cash:=app_private.monthly_cash_source_v2(r.driver_id,r.periodo_yyyymm);
    if (v_cash->>'presented') is null and coalesce((v_cash->>'due')::numeric,0)>0 then
      saltadas:=saltadas||jsonb_build_object('liquidacion_id',r.liquidacion_id,'motivo','Falta cargar la rendición del mes (a presentar $'||replace(to_char(round((v_cash->>'due')::numeric),'FM999,999,999,999'),',','.')||'). Si no rindió nada, cargá 0.');
      continue;
    end if;
    update public.payroll_liquidaciones set estado='aprobada',aprobada_by=v_uid,aprobada_at=now() where liquidacion_id=r.liquidacion_id;
    insert into public.payroll_eventos(periodo_yyyymm,liquidacion_id,driver_id,accion,actor_id,detalle) select r.periodo_yyyymm,r.liquidacion_id,r.driver_id,'aprobar',v_uid,jsonb_build_object('total',l.total,'descuento_rendicion',l.ajuste_rendiciones) from public.payroll_liquidaciones l where l.liquidacion_id=r.liquidacion_id;
    ok:=ok+1;
  end loop;
  return jsonb_build_object('ok',true,'aprobadas',ok,'saltadas',saltadas);
end $f$;
revoke all on function public.payroll_aprobar_v1(uuid[]) from public,anon;
grant execute on function public.payroll_aprobar_v1(uuid[]) to authenticated;

create or replace function public.save_payroll_monthly_cash_v2(p_driver uuid, p_period integer, p_presented numeric, p_updated_at timestamp with time zone default null::timestamp with time zone)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
declare v_cash jsonb; l public.payroll_liquidaciones%rowtype;
begin
  perform public.save_payroll_monthly_cash(p_driver,p_period,p_presented,p_updated_at); -- preserves guard, lock, audit and frozen receipts
  v_cash:=app_private.monthly_cash_source_v2(p_driver,p_period);
  select * into l from public.payroll_liquidaciones where driver_id=p_driver and periodo_yyyymm=p_period for update;
  if found and l.estado='aprobada' and coalesce((v_cash->>'discount')::numeric,0) is distinct from coalesce(l.ajuste_rendiciones,0) then
    insert into public.payroll_eventos(periodo_yyyymm,liquidacion_id,driver_id,accion,motivo,actor_id,detalle)
      values(p_period,l.liquidacion_id,p_driver,'reabrir','Se cargó la rendición después de aprobar: vuelve a pendiente para aplicar el descuento',auth.uid(),
        jsonb_build_object('estado_anterior','aprobada','total_anterior',l.total,'descuento_anterior',l.ajuste_rendiciones,'descuento_nuevo',v_cash->'discount','automatico',true));
    update public.payroll_liquidaciones set estado='pendiente',aprobada_by=null,aprobada_at=null,review_required=false,review_reason=null,review_detected_at=null
     where liquidacion_id=l.liquidacion_id;
    v_cash:=v_cash||jsonb_build_object('receipt_reopened',true);
  end if;
  return v_cash;
end $function$;
