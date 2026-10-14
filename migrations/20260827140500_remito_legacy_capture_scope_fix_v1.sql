-- El backfill inicial alcanzó remitos históricos sin servicio. Se eliminan
-- únicamente sus líneas sintéticas, derivadas y regenerables; firmas, fotos e
-- importes escalares originales permanecen intactos.

delete from public.remito_toll_reports t
using public.remitos r
where t.remito_id=r.remito_id
  and t.notes='legacy_scalar_v1'
  and r.operator_service_id is null;

delete from public.remito_excess_reports x
using public.remitos r
where x.remito_id=r.remito_id
  and x.notes='legacy_scalar_v1'
  and r.operator_service_id is null;

update public.remitos r
set addons_review_status='legacy'
where r.operator_service_id is null
  and r.addons_version=1
  and r.addons_review_status in ('pending','draft')
  and not exists(select 1 from public.remito_toll_reports t where t.remito_id=r.remito_id)
  and not exists(select 1 from public.remito_excess_reports x where x.remito_id=r.remito_id)
  and not exists(select 1 from public.operator_service_document_addon_reviews v where v.remito_id=r.remito_id);

create or replace function app_private.capture_legacy_remito_addons_v2(p_remito_id integer)
returns void
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $function$
declare
  r public.remitos%rowtype;
  s public.operator_services%rowtype;
  v_is_test boolean:=false;
  v_has_toll boolean:=false;
  v_has_excess boolean:=false;
begin
  select * into r from public.remitos where remito_id=p_remito_id for update;
  if not found or r.driver_id is null or r.addons_version<>1 then return; end if;
  if exists(select 1 from public.operator_service_document_addon_reviews x where x.remito_id=p_remito_id) then return; end if;
  if exists(select 1 from public.remito_toll_reports t where t.remito_id=p_remito_id and coalesce(t.notes,'')<>'legacy_scalar_v1')
    or exists(select 1 from public.remito_excess_reports x where x.remito_id=p_remito_id and coalesce(x.notes,'')<>'legacy_scalar_v1') then return;
  end if;

  if r.operator_service_id is null then return; end if;
  select * into s from public.operator_services where service_id=r.operator_service_id;
  if not found or s.billing_status='invoiced' then return; end if;
  v_is_test:=s.is_test;

  delete from public.remito_toll_reports where remito_id=p_remito_id and notes='legacy_scalar_v1';
  delete from public.remito_excess_reports where remito_id=p_remito_id and notes='legacy_scalar_v1';

  if coalesce(r.imp_peaje,0)>0 then
    insert into public.remito_toll_reports(
      remito_id,client_line_id,toll_name_snapshot,quantity,unit_amount,currency,payment_method,
      missing_evidence_reason,notes,created_by,is_test
    ) values(
      r.remito_id,gen_random_uuid(),'Total de peajes legado',1,r.imp_peaje,'ARS','manual',
      'Carga histórica sin comprobante estructurado','legacy_scalar_v1',r.driver_id,v_is_test
    );
    v_has_toll:=true;
  end if;
  if coalesce(r.imp_excedente,0)>0 then
    insert into public.remito_excess_reports(
      remito_id,client_line_id,concept_name_snapshot,quantity,unit_amount,currency,reason,notes,created_by,is_test
    ) values(
      r.remito_id,gen_random_uuid(),'Total de excedentes legado',1,r.imp_excedente,'ARS',
      'Carga histórica pendiente de clasificación','legacy_scalar_v1',r.driver_id,v_is_test
    );
    v_has_excess:=true;
  end if;
  if r.status='firmado' and not v_has_toll and not v_has_excess then
    insert into public.remito_toll_reports(
      remito_id,client_line_id,toll_name_snapshot,quantity,unit_amount,currency,payment_method,
      missing_evidence_reason,notes,created_by,is_test
    ) values(
      r.remito_id,gen_random_uuid(),'Total legado informado sin extras',1,0,'ARS','manual',
      'Carga histórica sin comprobante estructurado','legacy_scalar_v1',r.driver_id,v_is_test
    );
  end if;

  update public.remitos
  set addons_version=2,
      addons_review_status=case when status='firmado' then 'pending' else 'draft' end
  where remito_id=p_remito_id;
end;
$function$;

revoke all on function app_private.capture_legacy_remito_addons_v2(integer) from public,anon,authenticated;

-- Corrige los dos remitos vinculados que la primera versión ya clasificó,
-- evitando recrear sus líneas o cambiar sus valores.
update public.remitos r
set addons_version=2,
    addons_review_status=case when r.status='firmado' then 'pending' else 'draft' end
from public.operator_services s
where s.service_id=r.operator_service_id
  and s.billing_status<>'invoiced'
  and r.addons_version=1
  and (
    exists(select 1 from public.remito_toll_reports t where t.remito_id=r.remito_id and t.notes='legacy_scalar_v1')
    or exists(select 1 from public.remito_excess_reports x where x.remito_id=r.remito_id and x.notes='legacy_scalar_v1')
  );
