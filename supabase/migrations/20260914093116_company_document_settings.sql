create table public.company_document_settings (
 id boolean primary key default true check(id),
 legal_name text not null default '', tax_id text not null default '', address text not null default '', contact text not null default '',
 representative text not null default '', signature_image text not null default '',
 updated_at timestamptz not null default now(), updated_by uuid default auth.uid(),
 check(length(signature_image)<=400000),
 check(signature_image='' or signature_image ~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]+$')
);
alter table public.company_document_settings enable row level security;
grant select,insert,update on public.company_document_settings to authenticated;
create policy document_settings_read on public.company_document_settings for select to authenticated using(true);
create policy document_settings_insert on public.company_document_settings for insert to authenticated with check(app_private.current_auxilios_role()='administracion');
create policy document_settings_update on public.company_document_settings for update to authenticated using(app_private.current_auxilios_role()='administracion') with check(app_private.current_auxilios_role()='administracion');
