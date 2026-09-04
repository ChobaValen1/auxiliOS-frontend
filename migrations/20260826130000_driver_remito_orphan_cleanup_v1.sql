begin;

-- El Chofer puede retirar únicamente archivos propios que no hayan quedado
-- referenciados por ningún remito suyo. La política de lectura propia ya
-- existente completa el requisito SELECT + DELETE de Storage.
drop policy if exists storage_remito_media_delete_own_orphan on storage.objects;
create policy storage_remito_media_delete_own_orphan
on storage.objects
for delete
to authenticated
using (
  bucket_id = any (array['remitos'::text, 'firmas'::text])
  and owner_id = auth.uid()::text
  and not exists (
    select 1
    from public.remitos r
    where r.driver_id = auth.uid()
      and (
        right(coalesce(r.firma_imagen_url, ''), length(storage.objects.name)) = storage.objects.name
        or exists (
          select 1
          from unnest(coalesce(r.foto_urls, '{}'::text[])) as media_url
          where right(media_url, length(storage.objects.name)) = storage.objects.name
        )
      )
  )
);

commit;
