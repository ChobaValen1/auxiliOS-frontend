# Correcciones de cierre y diagnóstico de acceso

## Errores confirmados y cambios

- **400 al crear y finalizar un activado:** los registros de Postgres mostraron «El remito no pertenece al chofer asignado». El activado ya había liberado la asignación. La migración `20260925021039_activated_intake_remito_link_fix.sql` valida contra el chofer histórico de la activación, el documento exacto anulado, su viaje y su jornada. No permite vincular otro documento o chofer.
- **Finalizado ausente en Facturación:** el cierre manual solicitaba `pending`, pero la guardia documental lo convertía en `not_ready`. La migración `20260925021901_manual_finalize_billing_fix.sql` registra una excepción documental auditable al cierre manual sin firma. Los remitos firmados siguen obligados a pasar por Revisión y cierre; los activados requieren su decisión de facturación. `operator-service-lifecycle.js` explica la excepción en la confirmación.
- **Recuperación:** SRV-20260925-00093 ya estaba finalizado, con observaciones y revisión administrativa aprobada, sin remito. Se recuperó su envío a Facturación y se agregó un evento de auditoría. La consulta real `list_operator_billing_services_v3` confirmó su presencia. No se emitió una factura.
- **Acceso por email:** `supabase.js` antes convertía cualquier rechazo de autenticación en contraseña incorrecta. Ahora distingue credenciales inválidas, conexión, límite del servidor, cuenta suspendida y email no confirmado. Los fallos operativos no suman intentos de contraseña fallida. No se cambiaron contraseñas ni permisos.
- `Index.html`, `config.js` y `sw.js`: versión v135 y renovación de caché.

## Verificación y límites

- Suite completa: 600 pruebas aprobadas; sintaxis y controles de seguridad del repositorio aprobados.
- Regresión del 400: reproduce el fallo con la función anterior real, comprueba reversión de la creación fallida y verifica creación e idempotencia con la corrección.
- Pruebas de cierre ejecutadas con la guardia documental real. Pruebas adicionales rechazan vinculación de otro chofer, otro remito y remito firmado en el circuito activado.
- Ambas funciones corregidas se verificaron instaladas en Supabase. Las pruebas locales usan datos simulados; no equivalen a un ingreso real con la contraseña del usuario.
- **Acceso aún pendiente de corroborar con el usuario:** hay autenticaciones exitosas en los registros y no se confirmó la causa concreta de su rechazo. La nueva pantalla da un diagnóstico específico para el siguiente intento.
- Advisors revisados: avisos sobre funciones SECURITY DEFINER ejecutables, tablas RLS sin políticas y protección de contraseñas filtradas. Estas migraciones reemplazan funciones existentes y no amplían sus permisos. Referencias: [funciones](https://supabase.com/docs/guides/database/database-linter), [RLS sin políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Comprobación del usuario

1. Abrir la nueva versión e ingresar con email.
2. Crear y finalizar el ingreso activado pendiente, con la decisión Facturable: debe quedar en Facturación y conservar chofer/móvil históricos.
3. Confirmar SRV-20260925-00093 en Facturación sin filtros restrictivos.
4. Para un cierre manual sin firma, revisar el aviso de excepción; un remito firmado debe seguir abriendo Revisión y cierre.
