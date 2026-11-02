-- Sueldos Flota · Etapa 3: el mes como unidad (calcular → revisar → aprobar → pagar).
-- payroll_corridas: cuándo y quién calculó cada mes. payroll_eventos: quién aprobó, pagó o reabrió y por qué.
-- Revisión por excepción con alertas; aprobar y pagar en lote; reabrir con motivo. Todo solo por funciones de Administración.

alter table public.payroll_liquidaciones add column if not exists pago_referencia text check (pago_referencia is null or length(pago_referencia)<=120);

create table if not exists public.payroll_corridas(
  periodo_yyyymm integer primary key check (periodo_yyyymm/100 between 2000 and 2199 and periodo_yyyymm%100 between 1 and 12),
  calculada_at timestamptz,
  calculada_by uuid references public.users(user_id) on delete set null,
  choferes integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.payroll_eventos(
  evento_id bigint generated always as identity primary key,
  periodo_yyyymm integer not null,
  liquidacion_id uuid references public.payroll_liquidaciones(liquidacion_id) on delete set null,
  driver_id uuid references public.users(user_id) on delete set null,
  accion text not null check (accion in ('calcular','aprobar','pagar','reabrir')),
  motivo text,
  detalle jsonb not null default '{}'::jsonb,
  actor_id uuid references public.users(user_id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists payroll_eventos_period_idx on public.payroll_eventos(periodo_yyyymm,created_at desc);
create index if not exists payroll_eventos_liq_idx on public.payroll_eventos(liquidacion_id,created_at desc);
alter table public.payroll_corridas enable row level security;
alter table public.payroll_eventos enable row level security;
revoke all on public.payroll_corridas from anon, authenticated;
revoke all on public.payroll_eventos from anon, authenticated;
grant select on public.payroll_corridas, public.payroll_eventos to authenticated;
drop policy if exists payroll_corridas_read on public.payroll_corridas;
drop policy if exists payroll_eventos_read on public.payroll_eventos;
create policy payroll_corridas_read on public.payroll_corridas for select to authenticated using (app_private.current_auxilios_role() in ('administracion','supervision'));
create policy payroll_eventos_read on public.payroll_eventos for select to authenticated using (app_private.current_auxilios_role() in ('administracion','supervision'));

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
  insert into public.payroll_corridas(periodo_yyyymm,calculada_at,calculada_by,choferes) values(p_period,now(),v_uid,creadas+actualizadas+saltadas)
    on conflict (periodo_yyyymm) do update set calculada_at=excluded.calculada_at,calculada_by=excluded.calculada_by,choferes=excluded.choferes,updated_at=now();
  insert into public.payroll_eventos(periodo_yyyymm,accion,actor_id,detalle) values(p_period,'calcular',v_uid,jsonb_build_object('creadas',creadas,'actualizadas',actualizadas,'saltadas',saltadas,'errores',(select count(*) from jsonb_array_elements(detalle) x where (x->>'error')::boolean)));
  return jsonb_build_object('ok',true,'creadas',creadas,'actualizadas',actualizadas,'saltadas',saltadas,'detalle',detalle);
end $f$;
revoke all on function public.payroll_calcular_mes_v1(integer) from public,anon;
grant execute on function public.payroll_calcular_mes_v1(integer) to authenticated;

-- Revisión del mes: una fila por chofer activo con esquema o con liquidación, con alertas. Solo lectura.
create or replace function public.payroll_revision_mes_v1(p_period integer) returns jsonb
language plpgsql stable security definer set search_path='' as $f$
declare v_from date; v_until date; v_prev integer; filas jsonb; sin_esquema jsonb; v_paso text; n_liq int; n_pend int; n_apr int; n_pag int; corrida jsonb;
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'') not in ('administracion','supervision') then raise exception 'No autorizado'; end if;
  if p_period/100 not between 2000 and 2199 or p_period%100 not between 1 and 12 then raise exception 'Período inválido'; end if;
  v_from:=make_date(p_period/100,p_period%100,1); v_until:=(v_from+interval '1 month')::date;
  v_prev:=to_char(v_from-interval '1 month','YYYYMM')::int;
  with base as (
    select u.user_id, u.full_name, u.legajo, l.liquidacion_id, coalesce(l.estado,'sin_liquidacion') estado, l.jornadas, l.km_total, l.servicios, l.total,
           l.review_required, l.review_reason, l.cash_snapshot, l.pagada_at, l.pagada_metodo, l.pago_referencia,
           (select coalesce(sum(importe) filter (where categoria='haber'),0) from public.payroll_lineas x where x.liquidacion_id=l.liquidacion_id) haberes,
           (select coalesce(sum(importe) filter (where categoria='descuento'),0) from public.payroll_lineas x where x.liquidacion_id=l.liquidacion_id) descuentos,
           (select p.total from public.payroll_liquidaciones p where p.driver_id=u.user_id and p.periodo_yyyymm=v_prev) prev_total,
           (select count(*) from public.daily_logs d where d.driver_id=u.user_id and d.log_date>=v_from and d.log_date<v_until and d.status<>'closed') abiertas
    from public.users u
    left join public.payroll_liquidaciones l on l.driver_id=u.user_id and l.periodo_yyyymm=p_period
    where l.liquidacion_id is not null or (u.role_id=3 and u.is_active and exists(select 1 from public.payroll_settings s where s.user_id=u.user_id))
  ), al as (
    select b.*, (
      select coalesce(jsonb_agg(a) filter (where a is not null),'[]') from (values
        (case when b.liquidacion_id is null then jsonb_build_object('tipo','sin_calcular','nivel','bad','texto','Sin calcular: tocá «Calcular el mes»') end),
        (case when b.review_required then jsonb_build_object('tipo','cambio','nivel','bad','texto',coalesce(nullif(b.review_reason,''),'Cambió la información de origen')) end),
        (case when b.abiertas>0 and b.estado='pendiente' then jsonb_build_object('tipo','jornadas','nivel','warn','texto',b.abiertas||case when b.abiertas=1 then ' jornada sin cerrar' else ' jornadas sin cerrar' end) end),
        (case when b.estado='pendiente' and b.cash_snapshot is not null and (b.cash_snapshot->>'presented') is null and coalesce((b.cash_snapshot->>'due')::numeric,0)>0
              then jsonb_build_object('tipo','rendicion','nivel','warn','texto','Rendición sin presentar ($'||replace(to_char(round((b.cash_snapshot->>'due')::numeric),'FM999,999,999,999'),',','.')||')') end),
        (case when b.estado='pendiente' and coalesce(b.prev_total,0)>0 and abs(b.total-b.prev_total)/b.prev_total>0.30
              then jsonb_build_object('tipo','variacion','nivel','warn','texto',case when b.total>b.prev_total then '+' else '−' end||round(abs(b.total-b.prev_total)*100/b.prev_total)||' % vs. mes anterior') end)
      ) v(a)) alertas
    from base b
  )
  select coalesce(jsonb_agg(jsonb_build_object('liquidacion_id',liquidacion_id,'driver_id',user_id,'full_name',full_name,'legajo',legajo,'estado',estado,
           'jornadas',coalesce(jornadas,0),'km_total',coalesce(km_total,0),'servicios',coalesce(servicios,0),'haberes',haberes,'descuentos',descuentos,'neto',coalesce(total,0),
           'prev_total',prev_total,'pagada_at',pagada_at,'pagada_metodo',pagada_metodo,'pago_referencia',pago_referencia,'alertas',alertas,
           'listo',estado='pendiente' and jsonb_array_length(alertas)=0) order by full_name),'[]')
    into filas from al;
  select coalesce(jsonb_agg(u.full_name order by u.full_name),'[]') into sin_esquema from public.users u
   where u.role_id=3 and u.is_active and not exists(select 1 from public.payroll_settings s where s.user_id=u.user_id);
  select count(*),count(*) filter (where estado='pendiente'),count(*) filter (where estado='aprobada'),count(*) filter (where estado='pagada')
    into n_liq,n_pend,n_apr,n_pag from public.payroll_liquidaciones where periodo_yyyymm=p_period;
  v_paso:=case when n_liq=0 then 'sin_calcular' when n_pag=n_liq then 'pagado' when n_pend=0 then 'aprobado' else 'en_revision' end;
  select to_jsonb(c)||jsonb_build_object('calculada_por',(select full_name from public.users where user_id=c.calculada_by)) into corrida from public.payroll_corridas c where c.periodo_yyyymm=p_period;
  return jsonb_build_object('periodo',p_period,'paso',v_paso,'corrida',corrida,'filas',filas,'sin_esquema',sin_esquema,
    'prev_neto',(select coalesce(sum(total),0) from public.payroll_liquidaciones where periodo_yyyymm=v_prev),
    'conteo',jsonb_build_object('liquidaciones',n_liq,'pendientes',n_pend,'aprobadas',n_apr,'pagadas',n_pag));
end $f$;
revoke all on function public.payroll_revision_mes_v1(integer) from public,anon;
grant execute on function public.payroll_revision_mes_v1(integer) to authenticated;

-- Aprobar en lote: solo pendientes sin «cambió la información». Congela importes (el guard recalcula por última vez al aprobar).
create or replace function public.payroll_aprobar_v1(p_ids uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $f$
declare v_uid uuid:=auth.uid(); r record; ok int:=0; saltadas jsonb:='[]';
begin
  if v_uid is null or coalesce(app_private.current_auxilios_role(),'')<>'administracion' then raise exception 'No autorizado'; end if;
  if coalesce(array_length(p_ids,1),0)=0 or array_length(p_ids,1)>500 then raise exception 'Elegí entre 1 y 500 recibos.'; end if;
  for r in select * from public.payroll_liquidaciones where liquidacion_id=any(p_ids) order by liquidacion_id for update loop
    if r.estado<>'pendiente' then saltadas:=saltadas||jsonb_build_object('liquidacion_id',r.liquidacion_id,'motivo','Ya está '||r.estado); continue; end if;
    if r.review_required then saltadas:=saltadas||jsonb_build_object('liquidacion_id',r.liquidacion_id,'motivo','Cambió la información: recalculá antes de aprobar'); continue; end if;
    update public.payroll_liquidaciones set estado='aprobada',aprobada_by=v_uid,aprobada_at=now() where liquidacion_id=r.liquidacion_id;
    insert into public.payroll_eventos(periodo_yyyymm,liquidacion_id,driver_id,accion,actor_id,detalle) select r.periodo_yyyymm,r.liquidacion_id,r.driver_id,'aprobar',v_uid,jsonb_build_object('total',l.total) from public.payroll_liquidaciones l where l.liquidacion_id=r.liquidacion_id;
    ok:=ok+1;
  end loop;
  return jsonb_build_object('ok',true,'aprobadas',ok,'saltadas',saltadas);
end $f$;
revoke all on function public.payroll_aprobar_v1(uuid[]) from public,anon;
grant execute on function public.payroll_aprobar_v1(uuid[]) to authenticated;

-- Pagar en lote: solo aprobadas. Método, fecha y comprobante.
create or replace function public.payroll_pagar_v1(p_ids uuid[], p_metodo text, p_fecha date, p_referencia text default null) returns jsonb
language plpgsql security definer set search_path='' as $f$
declare v_uid uuid:=auth.uid(); r record; ok int:=0; saltadas jsonb:='[]'; v_ref text:=nullif(btrim(coalesce(p_referencia,'')),'');
begin
  if v_uid is null or coalesce(app_private.current_auxilios_role(),'')<>'administracion' then raise exception 'No autorizado'; end if;
  if coalesce(array_length(p_ids,1),0)=0 or array_length(p_ids,1)>500 then raise exception 'Elegí entre 1 y 500 recibos.'; end if;
  if p_metodo not in ('transferencia','efectivo','mixto','otro') then raise exception 'Elegí el método de pago.'; end if;
  if p_fecha is null or p_fecha>(now() at time zone 'America/Argentina/Buenos_Aires')::date or p_fecha<date '2020-01-01' then raise exception 'La fecha de pago no puede ser futura.'; end if;
  if v_ref is not null and length(v_ref)>120 then raise exception 'El comprobante es demasiado largo.'; end if;
  for r in select * from public.payroll_liquidaciones where liquidacion_id=any(p_ids) order by liquidacion_id for update loop
    if r.estado<>'aprobada' then saltadas:=saltadas||jsonb_build_object('liquidacion_id',r.liquidacion_id,'motivo',case when r.estado='pagada' then 'Ya está pagada' else 'Primero hay que aprobarla' end); continue; end if;
    update public.payroll_liquidaciones set estado='pagada',pagada_by=v_uid,pagada_metodo=p_metodo,pago_referencia=v_ref,
      pagada_at=(p_fecha::text||' 12:00:00-03:00')::timestamptz where liquidacion_id=r.liquidacion_id;
    insert into public.payroll_eventos(periodo_yyyymm,liquidacion_id,driver_id,accion,actor_id,detalle)
      values(r.periodo_yyyymm,r.liquidacion_id,r.driver_id,'pagar',v_uid,jsonb_build_object('total',r.total,'metodo',p_metodo,'fecha',p_fecha,'referencia',v_ref));
    ok:=ok+1;
  end loop;
  return jsonb_build_object('ok',true,'pagadas',ok,'saltadas',saltadas);
end $f$;
revoke all on function public.payroll_pagar_v1(uuid[],text,date,text) from public,anon;
grant execute on function public.payroll_pagar_v1(uuid[],text,date,text) to authenticated;

-- Reabrir con motivo: aprobada o pagada vuelve a pendiente (se borra el pago). Queda registrado.
create or replace function public.payroll_reabrir_v1(p_id uuid, p_motivo text) returns jsonb
language plpgsql security definer set search_path='' as $f$
declare v_uid uuid:=auth.uid(); r public.payroll_liquidaciones%rowtype; v_m text:=btrim(coalesce(p_motivo,''));
begin
  if v_uid is null or coalesce(app_private.current_auxilios_role(),'')<>'administracion' then raise exception 'No autorizado'; end if;
  if length(v_m)<5 or length(v_m)>300 then raise exception 'Escribí el motivo (entre 5 y 300 caracteres).'; end if;
  select * into r from public.payroll_liquidaciones where liquidacion_id=p_id for update;
  if not found then raise exception 'Recibo no encontrado'; end if;
  if r.estado='pendiente' then raise exception 'El recibo ya está pendiente.'; end if;
  insert into public.payroll_eventos(periodo_yyyymm,liquidacion_id,driver_id,accion,motivo,actor_id,detalle)
    values(r.periodo_yyyymm,r.liquidacion_id,r.driver_id,'reabrir',v_m,v_uid,jsonb_build_object('estado_anterior',r.estado,'total_anterior',r.total,'pagada_at',r.pagada_at,'pagada_metodo',r.pagada_metodo,'pago_referencia',r.pago_referencia));
  update public.payroll_liquidaciones set estado='pendiente',aprobada_by=null,aprobada_at=null,pagada_by=null,pagada_at=null,pagada_metodo=null,pago_referencia=null where liquidacion_id=p_id;
  return jsonb_build_object('ok',true,'estado_anterior',r.estado);
end $f$;
revoke all on function public.payroll_reabrir_v1(uuid,text) from public,anon;
grant execute on function public.payroll_reabrir_v1(uuid,text) to authenticated;

drop trigger if exists audit_payroll_corridas_changes on public.payroll_corridas;
create trigger audit_payroll_corridas_changes after insert or delete or update on public.payroll_corridas for each row execute function public.capture_audit_event('periodo_yyyymm');
