# Emails de la cuenta de AuxiliOS Solo

Plantillas en castellano para pegar en Supabase (base de Solo `yxmzcjvigaddvjfiwlvz`):
**Authentication → Emails → Templates**.

| Plantilla de Supabase | Asunto | Archivo |
|---|---|---|
| Confirm signup | Confirmá tu cuenta de AuxiliOS Solo | `confirmar-cuenta.html` |
| Reset password | Elegí una contraseña nueva | `nueva-contrasena.html` |
| Change email address | Confirmá tu email nuevo | `cambio-de-email.html` |

## Correo propio (SMTP)

1. Crear una cuenta en Resend (resend.com). El plan gratis manda 3.000 emails por mes.
2. En Resend → Domains, agregar el dominio (por ejemplo `auxilios.com.ar`) y cargar en el DNS los registros que indica (SPF, DKIM y DMARC).
3. En Resend → API Keys, crear una llave con permiso de envío.
4. En Supabase → Authentication → Emails → SMTP Settings → Enable custom SMTP:
   - Host: `smtp.resend.com` · Puerto: `465` · Usuario: `resend` · Contraseña: la llave de Resend
   - Remitente: `no-responder@<dominio>` · Nombre: `AuxiliOS Solo`
5. En Supabase → Authentication → Rate Limits, subir el límite de emails por hora (por ejemplo a 100).
6. En Supabase → Authentication → URL Configuration, cuando esté el dominio definitivo:
   - Site URL: `https://<dominio>/solo.html`
   - Redirect URLs: agregar `https://<dominio>/**`
