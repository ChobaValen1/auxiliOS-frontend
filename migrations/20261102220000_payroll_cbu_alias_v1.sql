-- Datos de pago del chofer para la hoja «Transferencias»: CBU/CVU (22 dígitos con verificadores) y alias.
-- Van en payroll_settings: solo Administración edita y Supervisión lee (políticas existentes).

create or replace function app_private.cbu_valido_v1(p text) returns boolean
language plpgsql immutable set search_path='' as $f$
declare w1 int[]:=array[7,1,3,9,7,1,3]; w2 int[]:=array[3,9,7,1,3,9,7,1,3,9,7,1,3]; s int:=0; i int;
begin
  if p is null then return true; end if;
  if p !~ '^\d{22}$' then return false; end if;
  for i in 1..7 loop s:=s+substr(p,i,1)::int*w1[i]; end loop;
  if (10-s%10)%10<>substr(p,8,1)::int then return false; end if;
  s:=0;
  for i in 1..13 loop s:=s+substr(p,8+i,1)::int*w2[i]; end loop;
  return (10-s%10)%10=substr(p,22,1)::int;
end $f$;

alter table public.payroll_settings add column if not exists cbu text;
alter table public.payroll_settings add column if not exists alias_cbu text;
alter table public.payroll_settings drop constraint if exists payroll_settings_cbu_chk;
alter table public.payroll_settings add constraint payroll_settings_cbu_chk check (app_private.cbu_valido_v1(cbu));
alter table public.payroll_settings drop constraint if exists payroll_settings_alias_chk;
alter table public.payroll_settings add constraint payroll_settings_alias_chk check (alias_cbu is null or alias_cbu ~ '^[a-z0-9.-]{6,20}$');
