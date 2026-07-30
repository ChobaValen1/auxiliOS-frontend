# Fundación ISO-ready — 2026-07-30

## Alcance implementado

- Login por DNI sin revelar emails.
- JWT de usuario para backend y Edge Functions.
- Alta mediante invitación; sin contraseña compartida.
- Recuperación por correo; administración no conoce la contraseña.
- CI con validación sintáctica, tests y auditoría de dependencias.
- Primer registro inmutable `audit_events` para entidades críticas.
- Eliminación de una contraseña personal escrita en una migración.

## Despliegue coordinado

1. Agregar `SUPABASE_ANON_KEY` al backend en Railway.
2. Confirmar `ALLOWED_ORIGINS`, `PASSWORD_RESET_REDIRECT` y `TRUST_PROXY`.
3. Desplegar el backend y comprobar `GET /health`.
4. Aplicar `migrations/2026-07-30_audit_events.sql` en staging.
5. Verificar alta, invitación, login por DNI, recuperación, OCR y rendición.
6. Desplegar el frontend.

La migración de auditoría debe probarse en staging porque el repositorio histórico no contiene
un baseline completo del esquema productivo. Los triggers sólo se crean sobre tablas existentes.

## Pendientes deliberados

Estos cambios reducen riesgos críticos, pero no equivalen a certificación ISO ni completan la
seguridad multiempresa:

- Exportar y versionar el esquema productivo completo.
- Definir RLS por tabla y políticas de Storage verificadas con tests por rol.
- Incorporar `organization_id` y aislamiento multi-tenant.
- Migrar firmas, fotos, odómetros e incidentes a buckets privados.
- Definir retención, borrado remoto y cifrado del outbox local.
- Configurar backups, pruebas de restauración, monitoreo, RTO/RPO y respuesta a incidentes.

No habilitar una segunda empresa hasta completar RLS, Storage privado y multi-tenancy.
