-- Liquidación de sueldos (Flota) calculada en la base. Etapa 1: mismo cálculo que el navegador.
-- Importe como lo interpreta PayrollMatrix.money (JS): número, o texto con formato argentino.
create or replace function app_private.payroll_money_v1(p jsonb) returns numeric
language plpgsql immutable set search_path='' as $f$
declare t text; n numeric;
begin
  if p is null or jsonb_typeof(p)='null' then return 0; end if;
  if jsonb_typeof(p)='number' then n:=(p#>>'{}')::numeric;
  else
    t:=btrim(p#>>'{}');
    if t='' then return 0; end if;
    if position(',' in t)>0 then t:=replace(replace(t,'.',''),',','.');
    elsif t ~ '^\d{1,3}(\.\d{3})+$' then t:=replace(t,'.',''); end if;
    begin n:=t::numeric; exception when others then raise exception 'Ingresá importes válidos y positivos.'; end;
  end if;
  if n<0 then raise exception 'Ingresá importes válidos y positivos.'; end if;
  return n;
end $f$;

-- Un chofer, un mes: el mismo cálculo que generarLiquidacionesMes + PayrollMatrix.calculate (supabase.js / payroll-matrix.js).
create or replace function app_private.payroll_compute_driver_v1(p_driver uuid, p_period integer) returns jsonb
language plpgsql security definer set search_path='' as $f$
declare
  v_from date; v_until date; v_ts_from timestamptz; v_ts_until timestamptz;
  s public.payroll_settings%rowtype; m jsonb;
  v_km_basis text; v_pay_type text; v_fixed boolean; v_pay_km boolean; v_pay_serv boolean; v_pay_pres boolean;
  v_bonuses jsonb:='[]'; v_bonus numeric:=0; v_rules jsonb:='[]'; v_seen text[]:='{}'; r record; b jsonb; v_key text;
  v_src jsonb:=jsonb_build_object('invoices','[]'::jsonb,'extras','[]'::jsonb,'captacion','[]'::jsonb);
  v_km numeric; v_km_records jsonb:='[]'; v_jornadas int; v_bad int;
  v_details jsonb:='[]'; v_commission numeric:=0; v_rows jsonb; v_base numeric; v_total numeric; v_den numeric; v_rec jsonb; rule jsonb;
  v_serv bigint; v_inc int; v_pres boolean; v_cash jsonb; v_ajuste numeric;
  v_basico numeric; v_vkm numeric; v_vserv numeric; v_bpres numeric; v_adic_km numeric; v_adic_serv numeric; v_bruto numeric; v_snapshot jsonb;
begin
  if p_period/100 not between 2000 and 2199 or p_period%100 not between 1 and 12 then raise exception 'Período inválido'; end if;
  v_from:=make_date(p_period/100,p_period%100,1); v_until:=(v_from+interval '1 month')::date;
  -- Mismo instante que el cliente: medianoche de Argentina (-03:00).
  v_ts_from:=(v_from::text||'T00:00:00-03:00')::timestamptz; v_ts_until:=(v_until::text||'T00:00:00-03:00')::timestamptz;
  select * into s from public.payroll_settings where user_id=p_driver;
  if not found then raise exception 'Sin esquema salarial'; end if;
  m:=coalesce(s.compensation_matrix,'{}'::jsonb);

  -- normalize()
  v_km_basis:=coalesce(m->>'km_basis','real');
  if v_km_basis not in ('real','billed') then raise exception 'Base de kilómetros inválida.'; end if;
  for b in select * from jsonb_array_elements(coalesce(m->'bonuses','[]'::jsonb)) loop
    if btrim(coalesce(b->>'name',''))='' then raise exception 'Nombrá cada bono mensual.'; end if;
    v_bonuses:=v_bonuses||jsonb_build_array(jsonb_build_object('name',btrim(b->>'name'),'amount',app_private.payroll_money_v1(b->'amount')));
  end loop;
  select coalesce(sum((x->>'amount')::numeric),0) into v_bonus from jsonb_array_elements(v_bonuses) x;
  v_bonus:=round(v_bonus,2);
  v_pay_type:=case when m->>'pay_type' in ('fixed','fixed_plus','variable') then m->>'pay_type' end;
  v_fixed:=v_pay_type is not distinct from 'fixed';
  v_pay_km:=not v_fixed and (m->'pay_km') is distinct from 'false'::jsonb;
  v_pay_serv:=not v_fixed and (m->'pay_services') is distinct from 'false'::jsonb;
  v_pay_pres:=(m->'pay_presentismo') is distinct from 'false'::jsonb;

  -- Comisiones: reglas activas asignadas al chofer (como cargarPayrollSettingsFlota).
  for r in select cr.commission_id,cr.name,cr.concept_id,cr.source,cr.mode,cr.value
           from public.payroll_commission_assignments a join public.payroll_commission_rules cr on cr.commission_id=a.commission_id
           where a.driver_id=p_driver and cr.active is distinct from false order by cr.name,cr.commission_id loop
    if (r.concept_id is null and r.source<>'captacion') or r.source not in ('extras','invoices','captacion') or r.mode not in ('fixed','percent') then
      raise exception 'Completá concepto, origen y modalidad de la comisión.'; end if;
    if r.mode='percent' and app_private.payroll_money_v1(to_jsonb(r.value))>100 then raise exception 'El porcentaje no puede superar 100.'; end if;
    v_key:=r.source||':'||coalesce(r.concept_id::text,'undefined');
    if v_key=any(v_seen) then raise exception 'El concepto tiene dos reglas para el mismo origen.'; end if;
    v_seen:=v_seen||v_key;
    v_rules:=v_rules||jsonb_build_array(jsonb_build_object('commission_id',r.commission_id,'concept_id',case when r.source='captacion' then null else r.concept_id end,
      'name',coalesce(r.name,''),'source',r.source,'mode',r.mode,'value',app_private.payroll_money_v1(to_jsonb(r.value))));
  end loop;

  -- Fuentes (servicios facturados, ventas y captaciones) solo si hacen falta, como hoy.
  if v_km_basis='billed' or jsonb_array_length(v_rules)>0 then
    v_src:=v_src||coalesce(app_private.payroll_matrix_sources_v3(p_driver,v_from,v_until),'{}'::jsonb);
  end if;

  -- Jornadas cerradas del mes y km reales (odómetro final − inicial; error si falta o es inválido).
  select count(*),count(*) filter (where km_inicio is null or km_final is null or km_final<km_inicio)
    into v_jornadas,v_bad from public.daily_logs where driver_id=p_driver and status='closed' and log_date>=v_from and log_date<v_until;
  if v_bad>0 then raise exception 'Jornada con odómetros incompletos o inválidos. Corregila antes de liquidar.'; end if;
  if v_km_basis='billed' then
    select coalesce(round(sum(app_private.payroll_money_v1(x->'km')),2),0),coalesce(jsonb_agg(x->'id'),'[]')
      into v_km,v_km_records from (select distinct on (x->>'id') x from jsonb_array_elements(coalesce(v_src->'invoices','[]'::jsonb)) x where (x->'km') is not null and jsonb_typeof(x->'km')<>'null') d;
  else
    select coalesce(sum(km_final-km_inicio),0) into v_km from public.daily_logs where driver_id=p_driver and status='closed' and log_date>=v_from and log_date<v_until;
  end if;

  -- Detalle de cada comisión.
  for rule in select * from jsonb_array_elements(v_rules) loop
    select coalesce(jsonb_agg(x),'[]') into v_rows from (select distinct on (x->>'id') x from jsonb_array_elements(coalesce(v_src->(rule->>'source'),'[]'::jsonb)) x
      where rule->>'source'='captacion' or x->>'concept_id' is not distinct from rule->>'concept_id') d;
    if rule->>'mode'='percent' and exists(select 1 from jsonb_array_elements(v_rows) x where x->>'currency' is distinct from 'ARS') then
      raise exception 'La comisión porcentual requiere importes en ARS.'; end if;
    v_den:=case when rule->>'mode'='percent' then 100 else 1 end;
    select coalesce(sum(app_private.payroll_money_v1(case when rule->>'mode'='fixed' then x->'quantity' else x->'amount' end)),0),
      coalesce(jsonb_agg(jsonb_build_object('id',x->'id','service_id',x->'service_id','remito_id',x->'remito_id','amount',x->'amount','quantity',x->'quantity',
        'total',round(app_private.payroll_money_v1(case when rule->>'mode'='fixed' then x->'quantity' else x->'amount' end)*(rule->>'value')::numeric/v_den,2))),'[]')
      into v_base,v_rec from jsonb_array_elements(v_rows) x;
    v_total:=round(v_base*(rule->>'value')::numeric/v_den,2);
    v_commission:=v_commission+v_total;
    v_details:=v_details||jsonb_build_array(rule||jsonb_build_object('base',v_base,'total',v_total,'records',(select coalesce(jsonb_agg(x->'id'),'[]') from jsonb_array_elements(v_rows) x),'record_details',v_rec));
  end loop;
  v_commission:=round(v_commission,2);

  v_serv:=app_private.driver_payroll_service_count_v2(p_driver,v_from,v_until);
  if v_serv is null or v_serv<0 then raise exception 'Conteo de servicios inválido'; end if;
  select count(*) into v_inc from public.incidents where driver_id=p_driver and created_at_device>=v_ts_from and created_at_device<v_ts_until;
  v_pres:=v_pay_pres and v_inc=0 and v_jornadas>0;

  v_basico:=coalesce(s.sueldo_basico,0); v_vkm:=coalesce(s.valor_km,0); v_vserv:=coalesce(s.valor_servicio,0); v_bpres:=coalesce(s.bono_presentismo,0);
  v_adic_km:=case when v_pay_km then v_km*v_vkm else 0 end;
  v_adic_serv:=case when v_pay_serv then v_serv*v_vserv else 0 end;
  v_cash:=app_private.monthly_cash_source_v2(p_driver,p_period);
  v_ajuste:=coalesce((v_cash->>'discount')::numeric,0);
  v_bruto:=v_bonus+v_commission+v_basico+v_adic_km+v_adic_serv+case when v_pres then v_bpres else 0 end;

  v_snapshot:=jsonb_strip_nulls(jsonb_build_object('pay_type',v_pay_type))||jsonb_build_object('km_basis',v_km_basis,'pay_km',v_pay_km,'pay_services',v_pay_serv,'pay_presentismo',v_pay_pres,
    'bonuses',v_bonuses,'commissions',v_rules,'commission_details',v_details,'km_records',v_km_records,'km',v_km,'completed_services_v2',true,'operator_sales_v3',true);
  return jsonb_build_object('driver_id',p_driver,'periodo_yyyymm',p_period,'jornadas',v_jornadas,'km_total',v_km,'servicios',v_serv,
    'sueldo_basico',v_basico,'adic_km',v_adic_km,'adic_serv',v_adic_serv,'presentismo_paga',v_pres,'bono_presentismo',case when v_pres then v_bpres else 0 end,
    'bonos_objetivos',0,'ajuste_rendiciones',v_ajuste,'total',greatest(0,v_bruto-v_ajuste),
    'valor_km_snapshot',v_vkm,'valor_servicio_snapshot',v_vserv,'bono_presentismo_snapshot',v_bpres,
    'bonus_monthly',v_bonus,'commission_total',v_commission,'compensation_snapshot',v_snapshot);
end $f$;
revoke all on function app_private.payroll_compute_driver_v1(uuid,integer) from public,anon,authenticated;
revoke all on function app_private.payroll_money_v1(jsonb) from public,anon,authenticated;

-- Vista previa del mes: no guarda nada. Choferes activos con esquema, como hoy.
create or replace function public.payroll_preview_mes_v1(p_period integer) returns jsonb
language plpgsql security definer set search_path='' as $f$
declare u record; out jsonb:='[]'; res jsonb; est text;
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'') not in ('administracion','supervision') then raise exception 'No autorizado'; end if;
  for u in select x.user_id,x.full_name from public.users x join public.payroll_settings ps on ps.user_id=x.user_id where x.role_id=3 and x.is_active order by x.full_name loop
    select estado into est from public.payroll_liquidaciones where driver_id=u.user_id and periodo_yyyymm=p_period;
    begin res:=app_private.payroll_compute_driver_v1(u.user_id,p_period)||jsonb_build_object('ok',true);
    exception when others then res:=jsonb_build_object('driver_id',u.user_id,'ok',false,'motivo',sqlerrm); end;
    out:=out||jsonb_build_array(res||jsonb_build_object('full_name',u.full_name,'estado_actual',est));
  end loop;
  return out;
end $f$;
revoke all on function public.payroll_preview_mes_v1(integer) from public,anon;
grant execute on function public.payroll_preview_mes_v1(integer) to authenticated;

-- Generar el mes en la base: mismas reglas que el botón actual (aprobadas y pagadas no se tocan; solo se actualizan pendientes).
create or replace function public.payroll_calcular_mes_v1(p_period integer) returns jsonb
language plpgsql security definer set search_path='' as $f$
declare u record; res jsonb; ex record; creadas int:=0; actualizadas int:=0; saltadas int:=0; detalle jsonb:='[]'; n int; v_uid uuid:=auth.uid();
begin
  if v_uid is null or coalesce(app_private.current_auxilios_role(),'')<>'administracion' then raise exception 'No autorizado'; end if;
  perform pg_advisory_xact_lock(hashtext('payroll_mes:'||p_period));
  for u in select x.user_id from public.users x join public.payroll_settings ps on ps.user_id=x.user_id where x.role_id=3 and x.is_active order by x.full_name loop
    begin
      res:=app_private.payroll_compute_driver_v1(u.user_id,p_period);
      select liquidacion_id,estado into ex from public.payroll_liquidaciones where driver_id=u.user_id and periodo_yyyymm=p_period for update;
      if found and ex.estado in ('pagada','aprobada') then saltadas:=saltadas+1;detalle:=detalle||jsonb_build_object('driverId',u.user_id,'accion','saltada','motivo',ex.estado);continue; end if;
      if found then
        update public.payroll_liquidaciones set review_required=false,review_reason=null,review_detected_at=null,proposed_total=null,adjustment_pending=null,
          bonus_monthly=(res->>'bonus_monthly')::numeric,commission_total=(res->>'commission_total')::numeric,compensation_snapshot=res->'compensation_snapshot',
          jornadas=(res->>'jornadas')::int,km_total=(res->>'km_total')::numeric,servicios=(res->>'servicios')::int,sueldo_basico=(res->>'sueldo_basico')::numeric,
          adic_km=(res->>'adic_km')::numeric,adic_serv=(res->>'adic_serv')::numeric,presentismo_paga=(res->>'presentismo_paga')::boolean,bono_presentismo=(res->>'bono_presentismo')::numeric,
          bonos_objetivos=0,ajuste_rendiciones=(res->>'ajuste_rendiciones')::numeric,total=(res->>'total')::numeric,
          valor_km_snapshot=(res->>'valor_km_snapshot')::numeric,valor_servicio_snapshot=(res->>'valor_servicio_snapshot')::numeric,bono_presentismo_snapshot=(res->>'bono_presentismo_snapshot')::numeric,
          generada_by=v_uid,generada_at=now()
        where liquidacion_id=ex.liquidacion_id and estado='pendiente';
        get diagnostics n=row_count;
        if n=0 then saltadas:=saltadas+1;detalle:=detalle||jsonb_build_object('driverId',u.user_id,'accion','saltada','motivo','El estado cambió durante el cálculo');
        else actualizadas:=actualizadas+1;detalle:=detalle||jsonb_build_object('driverId',u.user_id,'accion','actualizada','total',res->'total'); end if;
      else
        insert into public.payroll_liquidaciones(driver_id,periodo_yyyymm,estado,review_required,bonus_monthly,commission_total,compensation_snapshot,jornadas,km_total,servicios,sueldo_basico,adic_km,adic_serv,
          presentismo_paga,bono_presentismo,bonos_objetivos,ajuste_rendiciones,total,valor_km_snapshot,valor_servicio_snapshot,bono_presentismo_snapshot,generada_by,generada_at)
        values(u.user_id,p_period,'pendiente',false,(res->>'bonus_monthly')::numeric,(res->>'commission_total')::numeric,res->'compensation_snapshot',(res->>'jornadas')::int,(res->>'km_total')::numeric,
          (res->>'servicios')::int,(res->>'sueldo_basico')::numeric,(res->>'adic_km')::numeric,(res->>'adic_serv')::numeric,(res->>'presentismo_paga')::boolean,(res->>'bono_presentismo')::numeric,0,
          (res->>'ajuste_rendiciones')::numeric,(res->>'total')::numeric,(res->>'valor_km_snapshot')::numeric,(res->>'valor_servicio_snapshot')::numeric,(res->>'bono_presentismo_snapshot')::numeric,v_uid,now());
        creadas:=creadas+1;detalle:=detalle||jsonb_build_object('driverId',u.user_id,'accion','creada','total',res->'total');
      end if;
    exception when others then detalle:=detalle||jsonb_build_object('driverId',u.user_id,'error',true,'motivo',sqlerrm); end;
  end loop;
  return jsonb_build_object('ok',true,'creadas',creadas,'actualizadas',actualizadas,'saltadas',saltadas,'detalle',detalle);
end $f$;
revoke all on function public.payroll_calcular_mes_v1(integer) from public,anon;
grant execute on function public.payroll_calcular_mes_v1(integer) to authenticated;
