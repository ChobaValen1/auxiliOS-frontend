# Seguridad de AuxiliOS Frontend

## Principios

- La clave publicable de Supabase puede estar en el cliente; nunca una service-role key.
- La autorización real debe vivir en RLS, Storage policies, Edge Functions y backend.
- Ocultar una pantalla o botón por rol es solamente UX y no constituye autorización.
- Las Edge Functions reciben el JWT de la sesión activa, no la clave publicable como bearer.
- Los administradores invitan usuarios y envían recuperaciones; no conocen contraseñas ajenas.

## Dependencias de despliegue

El alta de personal (individual e importación) y la recuperación de acceso usan
`ENV.ADMIN_API_BASE_URL`, que apunta a la Edge Function `auxilios-admin` de Supabase.
Sus rutas `POST /api/create-user` y `POST /api/send-password-reset` exigen JWT,
usuario activo y rol `administracion` validado en el servidor. El preview de la
rama integrada tiene un origen permitido explícito; no se admite cualquier dominio Vercel.
El endpoint heredado `POST /api/login-by-dni` usa `ENV.API_BASE_URL`.

Antes de habilitar nuevas empresas, todas las tablas y buckets deben contar con RLS/policies
versionadas y aislamiento por organización. Los buckets con firmas, remitos, odómetros,
incidentes o documentación no deben quedar públicos.

## Datos offline

El outbox puede contener fotos, firmas y datos operativos. Debe tratarse como información
sensible: no usar equipos compartidos, cerrar sesión cuando corresponda y reportar de inmediato
la pérdida o robo de un dispositivo. La política de expiración y borrado remoto se implementará
como parte de la siguiente fase de privacidad.
