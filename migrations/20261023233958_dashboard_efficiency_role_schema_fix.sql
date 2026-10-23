-- Fix the RPC entry point, not its data query or authorization policy.
-- The canonical role resolver exists only in app_private, not public.
create or replace function public.dashboard_efficiency_v1(
 p_desde date default null,p_hasta date default null,p_empresas uuid[] default null,
 p_bases uuid[] default null,p_conceptos uuid[] default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'') not in ('administracion','facturacion','supervision') then
   raise exception 'No autorizado' using errcode='42501';
 end if;
 return app_private.dashboard_efficiency_core_v1(p_desde,p_hasta,p_empresas,p_bases,p_conceptos,
   (now() at time zone 'America/Argentina/Buenos_Aires')::date);
end $$;
revoke all on function public.dashboard_efficiency_v1(date,date,uuid[],uuid[],uuid[]) from public,anon;
grant execute on function public.dashboard_efficiency_v1(date,date,uuid[],uuid[],uuid[]) to authenticated;
