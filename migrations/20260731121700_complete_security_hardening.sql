-- Migration: 20260731121700_internal_role_helper_and_rpc_hardening_20260731

create schema if not exists app_private;
revoke all on schema app_private from public,anon;
grant usage on schema app_private to authenticated,service_role;

alter function public.current_auxilios_role() set schema app_private;
revoke all on function app_private.current_auxilios_role() from public,anon;
grant execute on function app_private.current_auxilios_role() to authenticated,service_role;

do $$ declare f record; v_sql text; begin
  for f in
    select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('enforce_daily_logs_mutation','fn_bloquear_periodo_cerrado','guard_remito_driver_changes') and p.prokind='f'
  loop
    v_sql:=replace(pg_get_functiondef(f.oid),'public.current_auxilios_role()','app_private.current_auxilios_role()');
    execute v_sql;
  end loop;
end $$;

alter function public.calcular_efectivo_dia(uuid,date) security invoker;
revoke all on function public.calcular_efectivo_dia(uuid,date) from public,anon;
grant execute on function public.calcular_efectivo_dia(uuid,date) to authenticated,service_role;

-- -----------------------------------------------------------------------------

-- Migration: 20260731121930_fleet_configuration_rls_hardening_20260731

do $$ declare t text; p record; begin
  foreach t in array array['trucks','asignaciones_grilla','periodos_operativos','service_plans','maintenance_logs','master_service_plans','truck_subscriptions','feriados','emergencias_config','tire_checks'] loop
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy if exists %I on public.%I',p.policyname,t);
    end loop;
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
    execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  end loop;
end $$;

create or replace function public.guard_truck_driver_update()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_role text:=app_private.current_auxilios_role();
begin
  if auth.role()='service_role' or current_user='postgres' or v_role='administracion' then return new; end if;
  if v_role<>'chofer' then raise exception 'TRUCK_WRITE_NOT_ALLOWED' using errcode='42501'; end if;
  if new.plate is distinct from old.plate or new.brand is distinct from old.brand or new.model is distinct from old.model
     or new.year is distinct from old.year or new.vin is distinct from old.vin or new.current_hours is distinct from old.current_hours
     or new.status is distinct from old.status or new.assigned_to is distinct from old.assigned_to or new.notes is distinct from old.notes
     or new.created_at is distinct from old.created_at or new.numero_interno is distinct from old.numero_interno
     or new.foto_url is distinct from old.foto_url or new.tipo_equipo is distinct from old.tipo_equipo then
    raise exception 'TRUCK_FIELDS_IMMUTABLE' using errcode='42501';
  end if;
  if new.current_km is distinct from old.current_km and not exists(
    select 1 from public.daily_logs d
    where d.driver_id=auth.uid() and d.truck_id=old.truck_id and d.status='closed'
      and d.log_date>=current_date-2 and d.km_final=new.current_km
      and (new.current_km>=old.current_km or coalesce(d.km_excepcion,false))
  ) then
    raise exception 'TRUCK_KM_NOT_LINKED_TO_JOURNEY' using errcode='42501';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_truck_driver_update on public.trucks;
create trigger trg_guard_truck_driver_update before update on public.trucks for each row execute function public.guard_truck_driver_update();

create or replace function public.normalize_tire_check_owner()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_role text:=app_private.current_auxilios_role();
begin
  if auth.role()='service_role' or current_user='postgres' or v_role='administracion' then return new; end if;
  if v_role<>'chofer' then raise exception 'TIRE_CHECK_WRITE_NOT_ALLOWED' using errcode='42501'; end if;
  new.driver_id:=auth.uid();
  if new.log_id is null or not exists(select 1 from public.daily_logs d where d.log_id=new.log_id and d.driver_id=auth.uid() and d.truck_id=new.truck_id) then
    raise exception 'TIRE_CHECK_JOURNEY_INVALID' using errcode='42501';
  end if;
  return new;
end $$;
drop trigger if exists trg_normalize_tire_check_owner on public.tire_checks;
create trigger trg_normalize_tire_check_owner before insert on public.tire_checks for each row execute function public.normalize_tire_check_owner();

create policy trucks_read_authenticated on public.trucks for select to authenticated using (true);
create policy trucks_admin_insert on public.trucks for insert to authenticated with check (app_private.current_auxilios_role()='administracion');
create policy trucks_admin_update on public.trucks for update to authenticated using (app_private.current_auxilios_role()='administracion') with check (app_private.current_auxilios_role()='administracion');
create policy trucks_admin_delete on public.trucks for delete to authenticated using (app_private.current_auxilios_role()='administracion');
create policy trucks_driver_km_update on public.trucks for update to authenticated
using (app_private.current_auxilios_role()='chofer' and exists(select 1 from public.daily_logs d where d.truck_id=trucks.truck_id and d.driver_id=auth.uid() and d.log_date>=current_date-2))
with check (app_private.current_auxilios_role()='chofer' and exists(select 1 from public.daily_logs d where d.truck_id=trucks.truck_id and d.driver_id=auth.uid() and d.status='closed' and d.log_date>=current_date-2 and d.km_final<=trucks.current_km));

create policy grid_read_management on public.asignaciones_grilla for select to authenticated using (app_private.current_auxilios_role() in ('administracion','supervision'));
create policy grid_read_driver_own on public.asignaciones_grilla for select to authenticated using (driver_id=auth.uid());
create policy grid_admin_all on public.asignaciones_grilla for all to authenticated using (app_private.current_auxilios_role()='administracion') with check (app_private.current_auxilios_role()='administracion');

create policy periods_read_authenticated on public.periodos_operativos for select to authenticated using (true);
create policy periods_admin_all on public.periodos_operativos for all to authenticated using (app_private.current_auxilios_role()='administracion') with check (app_private.current_auxilios_role()='administracion');
create policy legacy_plans_read_authenticated on public.service_plans for select to authenticated using (true);
create policy legacy_plans_admin_all on public.service_plans for all to authenticated using (app_private.current_auxilios_role()='administracion') with check (app_private.current_auxilios_role()='administracion');
create policy maintenance_read_authenticated on public.maintenance_logs for select to authenticated using (true);
create policy maintenance_admin_all on public.maintenance_logs for all to authenticated using (app_private.current_auxilios_role()='administracion') with check (app_private.current_auxilios_role()='administracion');
create policy master_plans_read_authenticated on public.master_service_plans for select to authenticated using (true);
create policy master_plans_admin_all on public.master_service_plans for all to authenticated using (app_private.current_auxilios_role()='administracion') with check (app_private.current_auxilios_role()='administracion');
create policy subscriptions_read_authenticated on public.truck_subscriptions for select to authenticated using (true);
create policy subscriptions_admin_all on public.truck_subscriptions for all to authenticated using (app_private.current_auxilios_role()='administracion') with check (app_private.current_auxilios_role()='administracion');
create policy holidays_read_authenticated on public.feriados for select to authenticated using (true);
create policy holidays_admin_all on public.feriados for all to authenticated using (app_private.current_auxilios_role()='administracion') with check (app_private.current_auxilios_role()='administracion');

create policy emergencies_read_active on public.emergencias_config for select to authenticated using (coalesce(is_active,true));
create policy emergencies_read_management on public.emergencias_config for select to authenticated using (app_private.current_auxilios_role() in ('administracion','supervision'));
create policy emergencies_admin_all on public.emergencias_config for all to authenticated using (app_private.current_auxilios_role()='administracion') with check (app_private.current_auxilios_role()='administracion');

create policy tire_checks_read_authenticated on public.tire_checks for select to authenticated using (true);
create policy tire_checks_insert_driver on public.tire_checks for insert to authenticated with check (app_private.current_auxilios_role()='chofer' and driver_id=auth.uid() and log_id is not null and exists(select 1 from public.daily_logs d where d.log_id=tire_checks.log_id and d.driver_id=auth.uid() and d.truck_id=tire_checks.truck_id));
create policy tire_checks_admin_all on public.tire_checks for all to authenticated using (app_private.current_auxilios_role()='administracion') with check (app_private.current_auxilios_role()='administracion');

-- -----------------------------------------------------------------------------

-- Migration: 20260731122040_documents_payroll_sync_rls_hardening_20260731

do $$ declare t text; p record; begin
  foreach t in array array['truck_docs','driver_docs','payroll_settings','payroll_objetivos','payroll_objetivo_cumplimientos','payroll_liquidaciones','sync_queue'] loop
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy if exists %I on public.%I',p.policyname,t);
    end loop;
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
  end loop;
end $$;

grant select,insert,update,delete on public.truck_docs,public.driver_docs,public.payroll_settings,public.payroll_objetivos,public.payroll_objetivo_cumplimientos,public.payroll_liquidaciones to authenticated;
grant select on public.sync_queue to authenticated;

create index if not exists idx_truck_docs_truck_id on public.truck_docs(truck_id);
create index if not exists idx_driver_docs_driver_id on public.driver_docs(driver_id);
create index if not exists idx_payroll_liq_driver on public.payroll_liquidaciones(driver_id);
create index if not exists idx_payroll_cumpl_driver on public.payroll_objetivo_cumplimientos(driver_id);

create policy truck_docs_read_management on public.truck_docs for select to authenticated using (app_private.current_auxilios_role() in ('administracion','supervision'));
create policy truck_docs_read_driver_vehicle on public.truck_docs for select to authenticated using (app_private.current_auxilios_role()='chofer' and exists(select 1 from public.daily_logs d where d.truck_id=truck_docs.truck_id and d.driver_id=auth.uid()));
create policy truck_docs_admin_all on public.truck_docs for all to authenticated using (app_private.current_auxilios_role()='administracion') with check (app_private.current_auxilios_role()='administracion');

create policy driver_docs_read_management on public.driver_docs for select to authenticated using (app_private.current_auxilios_role() in ('administracion','supervision'));
create policy driver_docs_read_own on public.driver_docs for select to authenticated using (driver_id=auth.uid());
create policy driver_docs_admin_all on public.driver_docs for all to authenticated using (app_private.current_auxilios_role()='administracion') with check (app_private.current_auxilios_role()='administracion');

create policy payroll_settings_read_management on public.payroll_settings for select to authenticated using (app_private.current_auxilios_role() in ('administracion','supervision'));
create policy payroll_settings_admin_all on public.payroll_settings for all to authenticated using (app_private.current_auxilios_role()='administracion') with check (app_private.current_auxilios_role()='administracion');
create policy payroll_objectives_read_management on public.payroll_objetivos for select to authenticated using (app_private.current_auxilios_role() in ('administracion','supervision'));
create policy payroll_objectives_admin_all on public.payroll_objetivos for all to authenticated using (app_private.current_auxilios_role()='administracion') with check (app_private.current_auxilios_role()='administracion');
create policy payroll_compliance_read_management on public.payroll_objetivo_cumplimientos for select to authenticated using (app_private.current_auxilios_role() in ('administracion','supervision'));
create policy payroll_compliance_admin_all on public.payroll_objetivo_cumplimientos for all to authenticated using (app_private.current_auxilios_role()='administracion') with check (app_private.current_auxilios_role()='administracion');
create policy payroll_liquidations_read_management on public.payroll_liquidaciones for select to authenticated using (app_private.current_auxilios_role() in ('administracion','supervision'));
create policy payroll_liquidations_admin_all on public.payroll_liquidaciones for all to authenticated using (app_private.current_auxilios_role()='administracion') with check (app_private.current_auxilios_role()='administracion');

create policy sync_queue_read_management on public.sync_queue for select to authenticated using (app_private.current_auxilios_role() in ('administracion','supervision'));

-- -----------------------------------------------------------------------------

-- Migration: 20260731122348_security_invoker_views_and_extension_20260731

do $$ declare v text; begin
  foreach v in array array['v_truck_doc_alerts','v_service_plan_status','v_alertas_sincronizacion','v_driver_summary_day','v_driver_summary_month','v_driver_summary_year','v_truck_docs_status','v_driver_docs_status'] loop
    execute format('alter view public.%I set (security_invoker=true)',v);
    execute format('revoke all on public.%I from public,anon,authenticated',v);
    execute format('grant select on public.%I to authenticated',v);
  end loop;
end $$;
alter extension btree_gist set schema extensions;

-- -----------------------------------------------------------------------------

-- Migration: 20260731122410_storage_listing_and_upload_hardening_20260731

drop policy if exists "Lectura docs autenticados" on storage.objects;
drop policy if exists "Lectura odometros autenticados" on storage.objects;
drop policy if exists "Leer fotos remitos" on storage.objects;
drop policy if exists "Permitir actualizar docs a autenticados" on storage.objects;
drop policy if exists "Permitir subidas a personal autenticado" on storage.objects;
drop policy if exists "Subida odometros autenticados" on storage.objects;
drop policy if exists "Subir fotos remitos" on storage.objects;

create policy storage_odometer_read_scoped on storage.objects for select to authenticated using (bucket_id='odometros' and (owner_id=auth.uid()::text or app_private.current_auxilios_role() in ('administracion','supervision')));
create policy storage_odometer_insert_own on storage.objects for insert to authenticated with check (bucket_id='odometros' and owner_id=auth.uid()::text and (storage.foldername(name))[1] in ('inicio','cierre'));
create policy storage_odometer_update_own on storage.objects for update to authenticated using (bucket_id='odometros' and owner_id=auth.uid()::text) with check (bucket_id='odometros' and owner_id=auth.uid()::text);

create policy storage_docs_read_scoped on storage.objects for select to authenticated using (bucket_id='docs' and (app_private.current_auxilios_role() in ('administracion','supervision') or owner_id=auth.uid()::text or exists(select 1 from public.driver_docs d where d.driver_id=auth.uid() and (d.file_url=name or d.file_url like '%'||name)) or exists(select 1 from public.truck_docs td where (td.file_url=name or td.file_url like '%'||name) and exists(select 1 from public.daily_logs dl where dl.truck_id=td.truck_id and dl.driver_id=auth.uid()))));
create policy storage_docs_insert_admin on storage.objects for insert to authenticated with check (bucket_id='docs' and app_private.current_auxilios_role()='administracion');
create policy storage_docs_update_admin on storage.objects for update to authenticated using (bucket_id='docs' and app_private.current_auxilios_role()='administracion') with check (bucket_id='docs' and app_private.current_auxilios_role()='administracion');
create policy storage_docs_delete_admin on storage.objects for delete to authenticated using (bucket_id='docs' and app_private.current_auxilios_role()='administracion');

create policy storage_remito_media_read_scoped on storage.objects for select to authenticated using (bucket_id in ('remitos','firmas') and (owner_id=auth.uid()::text or app_private.current_auxilios_role() in ('administracion','supervision')));
create policy storage_remito_media_insert_own on storage.objects for insert to authenticated with check (bucket_id in ('remitos','firmas') and owner_id=auth.uid()::text);
create policy storage_remito_media_update_own on storage.objects for update to authenticated using (bucket_id in ('remitos','firmas') and owner_id=auth.uid()::text) with check (bucket_id in ('remitos','firmas') and owner_id=auth.uid()::text);
create policy storage_remito_media_delete_admin on storage.objects for delete to authenticated using (bucket_id in ('remitos','firmas') and app_private.current_auxilios_role()='administracion');

update storage.buckets set file_size_limit=15728640,allowed_mime_types=array['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif'] where id='docs';
update storage.buckets set file_size_limit=10485760,allowed_mime_types=array['image/jpeg','image/png','image/webp','image/heic','image/heif'] where id in ('odometros','remitos');
update storage.buckets set file_size_limit=2097152,allowed_mime_types=array['image/png','image/jpeg','image/webp'] where id='firmas';

-- -----------------------------------------------------------------------------

-- Migration: 20260731123036_alerts_and_renditions_privilege_hardening_20260731

drop policy if exists admin_all_alertas on public.alertas_operativas;
drop policy if exists chofer_read_own_alertas on public.alertas_operativas;
drop policy if exists supervisor_read_alertas on public.alertas_operativas;
drop policy if exists admin_all_rendicion on public.rendicion_cierre;
drop policy if exists chofer_own_rendicion on public.rendicion_cierre;
drop policy if exists supervisor_read_rendicion on public.rendicion_cierre;

revoke all on public.alertas_operativas,public.rendicion_cierre from anon,authenticated;
grant select,insert,update,delete on public.alertas_operativas,public.rendicion_cierre to authenticated;

create policy alerts_read_management on public.alertas_operativas for select to authenticated using (app_private.current_auxilios_role() in ('administracion','supervision'));
create policy alerts_read_driver_own on public.alertas_operativas for select to authenticated using (driver_id=auth.uid());
create policy alerts_admin_all on public.alertas_operativas for all to authenticated using (app_private.current_auxilios_role()='administracion') with check (app_private.current_auxilios_role()='administracion');

create or replace function public.guard_driver_rendition_changes()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_role text:=app_private.current_auxilios_role();
begin
 if auth.role()='service_role' or current_user='postgres' or v_role='administracion' then return new; end if;
 if v_role<>'chofer' then raise exception 'RENDITION_WRITE_NOT_ALLOWED' using errcode='42501'; end if;
 if tg_op='INSERT' then
   if new.driver_id is distinct from auth.uid() or not exists(select 1 from public.daily_logs d where d.log_id=new.log_id and d.driver_id=auth.uid() and d.log_date=new.fecha) then raise exception 'RENDITION_OWNER_OR_JOURNEY_INVALID' using errcode='42501'; end if;
   new.revisado_por:=null; new.revisado_at:=null; new.nota_revision:=null;
   new.admin_status:='pendiente'; new.admin_by:=null; new.admin_at:=null; new.admin_nota:=null;
   return new;
 end if;
 if old.driver_id is distinct from auth.uid() or new.driver_id is distinct from old.driver_id or new.log_id is distinct from old.log_id or new.fecha is distinct from old.fecha or new.efectivo_esperado is distinct from old.efectivo_esperado or new.gastos_sistema is distinct from old.gastos_sistema or new.estado is distinct from old.estado or new.revisado_por is distinct from old.revisado_por or new.revisado_at is distinct from old.revisado_at or new.nota_revision is distinct from old.nota_revision or new.admin_status is distinct from old.admin_status or new.admin_by is distinct from old.admin_by or new.admin_at is distinct from old.admin_at or new.admin_nota is distinct from old.admin_nota or new.created_at is distinct from old.created_at then
   raise exception 'RENDITION_PROTECTED_FIELDS_IMMUTABLE' using errcode='42501';
 end if;
 return new;
end $$;
drop trigger if exists trg_guard_driver_rendition_changes on public.rendicion_cierre;
create trigger trg_guard_driver_rendition_changes before insert or update on public.rendicion_cierre for each row execute function public.guard_driver_rendition_changes();

create policy renditions_read_management on public.rendicion_cierre for select to authenticated using (app_private.current_auxilios_role() in ('administracion','supervision'));
create policy renditions_read_driver_own on public.rendicion_cierre for select to authenticated using (driver_id=auth.uid());
create policy renditions_insert_driver_own on public.rendicion_cierre for insert to authenticated with check (app_private.current_auxilios_role()='chofer' and driver_id=auth.uid() and exists(select 1 from public.daily_logs d where d.log_id=rendicion_cierre.log_id and d.driver_id=auth.uid() and d.log_date=rendicion_cierre.fecha));
create policy renditions_update_driver_own on public.rendicion_cierre for update to authenticated using (app_private.current_auxilios_role()='chofer' and driver_id=auth.uid()) with check (app_private.current_auxilios_role()='chofer' and driver_id=auth.uid());
create policy renditions_admin_all on public.rendicion_cierre for all to authenticated using (app_private.current_auxilios_role()='administracion') with check (app_private.current_auxilios_role()='administracion');