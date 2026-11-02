-- Sueldos Flota · Etapa 2: novedades del mes y recibo por líneas.
-- Novedades: las carga Administración (Supervisión solo ve). Bono, horas extra y viático suman; adelanto, vale y descuento restan.
-- Con el recibo aprobado o pagado las novedades quedan congeladas: hay que volverlo a pendiente para cambiarlas.
-- Líneas: las arma la base cada vez que se guarda una liquidación pendiente o se aprueba. Nadie las escribe directo.

create table if not exists public.payroll_novedades(
  novedad_id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.users(user_id) on delete cascade,
  periodo_yyyymm integer not null check (periodo_yyyymm/100 between 2000 and 2199 and periodo_yyyymm%100 between 1 and 12),
  tipo text not null check (tipo in ('bono','horas_extra','viatico','adelanto','vale','descuento')),
  concepto text not null check (length(btrim(concepto)) between 1 and 80),
  importe numeric(14,2) not null check (importe>0 and importe<=999999999999.99),
  fecha date,
  nota text check (nota is null or length(nota)<=300),
  created_by uuid references public.users(user_id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payroll_novedades_driver_period_idx on public.payroll_novedades(driver_id,periodo_yyyymm);

create table if not exists public.payroll_lineas(
  linea_id bigint generated always as identity primary key,
  liquidacion_id uuid not null references public.payroll_liquidaciones(liquidacion_id) on delete cascade,
  orden integer not null,
  categoria text not null check (categoria in ('haber','descuento')),
  origen text not null,
  origen_id text,
  concepto text not null,
  detalle text,
  cantidad numeric,
  valor numeric,
  importe numeric(14,2) not null
);
create index if not exists payroll_lineas_liq_idx on public.payroll_lineas(liquidacion_id,orden);

alter table public.payroll_novedades enable row level security;
alter table public.payroll_lineas enable row level security;
revoke all on public.payroll_novedades from anon, authenticated;
revoke all on public.payroll_lineas from anon, authenticated;
grant select, insert, update, delete on public.payroll_novedades to authenticated;
grant select on public.payroll_lineas to authenticated;
drop policy if exists payroll_novedades_read on public.payroll_novedades;
drop policy if exists payroll_novedades_admin on public.payroll_novedades;
drop policy if exists payroll_lineas_read on public.payroll_lineas;
create policy payroll_novedades_read on public.payroll_novedades for select to authenticated
  using (app_private.current_auxilios_role() in ('administracion','supervision'));
create policy payroll_novedades_admin on public.payroll_novedades for all to authenticated
  using (app_private.current_auxilios_role()='administracion') with check (app_private.current_auxilios_role()='administracion');
create policy payroll_lineas_read on public.payroll_lineas for select to authenticated
  using (app_private.current_auxilios_role() in ('administracion','supervision'));

-- Neto de novedades de un chofer y mes: haberes − descuentos.
create or replace function app_private.payroll_novedades_neto_v1(p_driver uuid, p_period integer) returns numeric
language sql stable security definer set search_path='' as $f$
  select coalesce(sum(case when tipo in ('bono','horas_extra','viatico') then importe else -importe end),0)
  from public.payroll_novedades where driver_id=p_driver and periodo_yyyymm=p_period
$f$;

-- Bloquea cambios con el recibo aprobado o pagado y, si está pendiente, recalcula su total y líneas.
create or replace function app_private.payroll_novedades_guard_v1() returns trigger
language plpgsql security definer set search_path='' as $f$
declare r record; v_est text;
begin
  for r in select distinct d, p from (values (case when tg_op<>'INSERT' then old.driver_id end, case when tg_op<>'INSERT' then old.periodo_yyyymm end),
                                             (case when tg_op<>'DELETE' then new.driver_id end, case when tg_op<>'DELETE' then new.periodo_yyyymm end)) v(d,p) where d is not null loop
    select estado into v_est from public.payroll_liquidaciones where driver_id=r.d and periodo_yyyymm=r.p for update;
    if v_est in ('aprobada','pagada') then raise exception 'El recibo de ese mes está %: volvelo a pendiente para cambiar novedades.', v_est; end if;
  end loop;
  if tg_op='UPDATE' then new.updated_at:=now(); new.created_by:=old.created_by; new.created_at:=old.created_at; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $f$;

create or replace function app_private.payroll_novedades_touch_v1() returns trigger
language plpgsql security definer set search_path='' as $f$
begin
  update public.payroll_liquidaciones l set total=l.total
   where l.estado='pendiente' and ((tg_op<>'INSERT' and l.driver_id=old.driver_id and l.periodo_yyyymm=old.periodo_yyyymm)
                               or (tg_op<>'DELETE' and l.driver_id=new.driver_id and l.periodo_yyyymm=new.periodo_yyyymm));
  return null;
end $f$;

drop trigger if exists payroll_novedades_guard on public.payroll_novedades;
drop trigger if exists payroll_novedades_touch on public.payroll_novedades;
drop trigger if exists audit_payroll_novedades_changes on public.payroll_novedades;
create trigger payroll_novedades_guard before insert or update or delete on public.payroll_novedades for each row execute function app_private.payroll_novedades_guard_v1();
create trigger payroll_novedades_touch after insert or update or delete on public.payroll_novedades for each row execute function app_private.payroll_novedades_touch_v1();
create trigger audit_payroll_novedades_changes after insert or delete or update on public.payroll_novedades for each row execute function public.capture_audit_event('novedad_id');

-- El total guardado suma el neto de novedades (mismo cálculo de siempre + novedades).
create or replace function app_private.payroll_monthly_cash_guard() returns trigger
language plpgsql security definer set search_path='' as $f$
begin
 if new.estado='pendiente' or (tg_op='UPDATE' and old.estado='pendiente' and new.estado='aprobada') then
  if coalesce((new.compensation_snapshot->>'completed_services_v2')::boolean,false) then
      new.cash_snapshot:=app_private.monthly_cash_source_v2(new.driver_id,new.periodo_yyyymm);
    else new.cash_snapshot:=app_private.monthly_cash_source(new.driver_id,new.periodo_yyyymm); end if;
  new.ajuste_rendiciones:=(new.cash_snapshot->>'discount')::numeric;
  new.total:=greatest(0,coalesce(new.sueldo_basico,0)+coalesce(new.adic_km,0)+coalesce(new.adic_serv,0)+case when new.presentismo_paga then coalesce(new.bono_presentismo,0) else 0 end+coalesce(new.bonos_objetivos,0)+coalesce(new.bonus_monthly,0)+coalesce(new.commission_total,0)-new.ajuste_rendiciones
    +app_private.payroll_novedades_neto_v1(new.driver_id,new.periodo_yyyymm));
 end if;
 return new;
end $f$;

-- Arma las líneas del recibo desde los importes guardados y las novedades.
create or replace function app_private.payroll_rebuild_lines_v1(p_liq uuid) returns void
language plpgsql security definer set search_path='' as $f$
declare l public.payroll_liquidaciones%rowtype; o int:=0; b jsonb; c jsonb; n record; v_sum numeric;
begin
  select * into l from public.payroll_liquidaciones where liquidacion_id=p_liq;
  if not found then return; end if;
  delete from public.payroll_lineas where liquidacion_id=p_liq;
  if coalesce(l.sueldo_basico,0)<>0 then o:=o+1; insert into public.payroll_lineas(liquidacion_id,orden,categoria,origen,concepto,importe) values(p_liq,o,'haber','basico','Sueldo básico',l.sueldo_basico); end if;
  if coalesce(l.adic_km,0)<>0 then o:=o+1; insert into public.payroll_lineas(liquidacion_id,orden,categoria,origen,concepto,detalle,cantidad,valor,importe)
    values(p_liq,o,'haber','km',case when l.compensation_snapshot->>'km_basis'='billed' then 'Kilómetros facturados' else 'Kilómetros de jornadas' end,'km × valor por km',l.km_total,l.valor_km_snapshot,l.adic_km); end if;
  if coalesce(l.adic_serv,0)<>0 then o:=o+1; insert into public.payroll_lineas(liquidacion_id,orden,categoria,origen,concepto,detalle,cantidad,valor,importe)
    values(p_liq,o,'haber','servicios','Servicios','servicios × valor por servicio',l.servicios,l.valor_servicio_snapshot,l.adic_serv); end if;
  if l.presentismo_paga and coalesce(l.bono_presentismo,0)<>0 then o:=o+1; insert into public.payroll_lineas(liquidacion_id,orden,categoria,origen,concepto,detalle,importe)
    values(p_liq,o,'haber','presentismo','Presentismo','Sin incidentes en el mes',l.bono_presentismo); end if;
  if coalesce(l.bonus_monthly,0)<>0 then
    select coalesce(sum((x->>'amount')::numeric),0) into v_sum from jsonb_array_elements(coalesce(l.compensation_snapshot->'bonuses','[]'::jsonb)) x;
    if abs(v_sum-l.bonus_monthly)<=0.01 then
      for b in select x from jsonb_array_elements(l.compensation_snapshot->'bonuses') x where (x->>'amount')::numeric<>0 loop
        o:=o+1; insert into public.payroll_lineas(liquidacion_id,orden,categoria,origen,concepto,detalle,importe) values(p_liq,o,'haber','bono_mensual',b->>'name','Bono mensual del esquema',(b->>'amount')::numeric);
      end loop;
    else o:=o+1; insert into public.payroll_lineas(liquidacion_id,orden,categoria,origen,concepto,importe) values(p_liq,o,'haber','bono_mensual','Bonos mensuales',l.bonus_monthly); end if;
  end if;
  if coalesce(l.commission_total,0)<>0 then
    select coalesce(sum((x->>'total')::numeric),0) into v_sum from jsonb_array_elements(coalesce(l.compensation_snapshot->'commission_details','[]'::jsonb)) x;
    if abs(v_sum-l.commission_total)<=0.01 then
      for c in select x from jsonb_array_elements(l.compensation_snapshot->'commission_details') x where (x->>'total')::numeric<>0 loop
        o:=o+1; insert into public.payroll_lineas(liquidacion_id,orden,categoria,origen,origen_id,concepto,detalle,cantidad,valor,importe)
          values(p_liq,o,'haber','comision',c->>'commission_id',coalesce(nullif(c->>'name',''),'Comisión'),
            case when c->>'mode'='percent' then (c->>'value')||' % de $'||(c->>'base') else (c->>'base')||' × $'||(c->>'value') end,
            (c->>'base')::numeric,(c->>'value')::numeric,(c->>'total')::numeric);
      end loop;
    else o:=o+1; insert into public.payroll_lineas(liquidacion_id,orden,categoria,origen,concepto,importe) values(p_liq,o,'haber','comision','Comisiones',l.commission_total); end if;
  end if;
  if coalesce(l.bonos_objetivos,0)<>0 then o:=o+1; insert into public.payroll_lineas(liquidacion_id,orden,categoria,origen,concepto,importe) values(p_liq,o,'haber','objetivos','Bonos por objetivos (histórico)',l.bonos_objetivos); end if;
  for n in select * from public.payroll_novedades where driver_id=l.driver_id and periodo_yyyymm=l.periodo_yyyymm and tipo in ('bono','horas_extra','viatico') order by coalesce(fecha,created_at::date),created_at loop
    o:=o+1; insert into public.payroll_lineas(liquidacion_id,orden,categoria,origen,origen_id,concepto,detalle,importe) values(p_liq,o,'haber','novedad',n.novedad_id::text,n.concepto,n.nota,n.importe);
  end loop;
  if coalesce(l.ajuste_rendiciones,0)<>0 then o:=o+1; insert into public.payroll_lineas(liquidacion_id,orden,categoria,origen,concepto,detalle,importe)
    values(p_liq,o,'descuento','rendicion','Faltante de efectivo','Rendición del mes',l.ajuste_rendiciones); end if;
  for n in select * from public.payroll_novedades where driver_id=l.driver_id and periodo_yyyymm=l.periodo_yyyymm and tipo in ('adelanto','vale','descuento') order by coalesce(fecha,created_at::date),created_at loop
    o:=o+1; insert into public.payroll_lineas(liquidacion_id,orden,categoria,origen,origen_id,concepto,detalle,importe) values(p_liq,o,'descuento','novedad',n.novedad_id::text,n.concepto,n.nota,n.importe);
  end loop;
end $f$;

create or replace function app_private.payroll_lines_trigger_v1() returns trigger
language plpgsql security definer set search_path='' as $f$
begin
  if new.estado='pendiente' or (tg_op='UPDATE' and old.estado='pendiente' and new.estado='aprobada') then perform app_private.payroll_rebuild_lines_v1(new.liquidacion_id); end if;
  return null;
end $f$;
drop trigger if exists payroll_lines_rebuild on public.payroll_liquidaciones;
create trigger payroll_lines_rebuild after insert or update on public.payroll_liquidaciones for each row execute function app_private.payroll_lines_trigger_v1();

revoke all on function app_private.payroll_novedades_neto_v1(uuid,integer) from public,anon,authenticated;
revoke all on function app_private.payroll_novedades_guard_v1() from public,anon,authenticated;
revoke all on function app_private.payroll_novedades_touch_v1() from public,anon,authenticated;
revoke all on function app_private.payroll_rebuild_lines_v1(uuid) from public,anon,authenticated;
revoke all on function app_private.payroll_lines_trigger_v1() from public,anon,authenticated;

-- El cálculo del mes también suma las novedades (vista previa y detalle de «Calcular el mes»).
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
  v_serv bigint; v_inc int; v_pres boolean; v_cash jsonb; v_ajuste numeric; v_nov numeric;
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
  v_nov:=app_private.payroll_novedades_neto_v1(p_driver,p_period);
  v_bruto:=v_bonus+v_commission+v_basico+v_adic_km+v_adic_serv+case when v_pres then v_bpres else 0 end;

  v_snapshot:=jsonb_strip_nulls(jsonb_build_object('pay_type',v_pay_type))||jsonb_build_object('km_basis',v_km_basis,'pay_km',v_pay_km,'pay_services',v_pay_serv,'pay_presentismo',v_pay_pres,
    'bonuses',v_bonuses,'commissions',v_rules,'commission_details',v_details,'km_records',v_km_records,'km',v_km,'completed_services_v2',true,'operator_sales_v3',true);
  return jsonb_build_object('driver_id',p_driver,'periodo_yyyymm',p_period,'jornadas',v_jornadas,'km_total',v_km,'servicios',v_serv,
    'sueldo_basico',v_basico,'adic_km',v_adic_km,'adic_serv',v_adic_serv,'presentismo_paga',v_pres,'bono_presentismo',case when v_pres then v_bpres else 0 end,
    'bonos_objetivos',0,'ajuste_rendiciones',v_ajuste,'novedades_neto',v_nov,'total',greatest(0,v_bruto-v_ajuste+v_nov),
    'valor_km_snapshot',v_vkm,'valor_servicio_snapshot',v_vserv,'bono_presentismo_snapshot',v_bpres,
    'bonus_monthly',v_bonus,'commission_total',v_commission,'compensation_snapshot',v_snapshot);
end $f$;
revoke all on function app_private.payroll_compute_driver_v1(uuid,integer) from public,anon,authenticated;

-- Líneas para las liquidaciones que ya existen (sin tocar sus importes).
select app_private.payroll_rebuild_lines_v1(liquidacion_id) from public.payroll_liquidaciones;
