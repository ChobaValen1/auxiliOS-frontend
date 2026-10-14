# Actualización del flujo de servicios · 24/09/2026

Versión: `flujo-servicios-v132-20260924`.

## Cambios y ubicación

| Pedido | Resultado | Archivos |
|---|---|---|
| Reasignación Chofer ↔ Móvil | Comparte el autocompletado por jornada con la creación. Permite asignación manual y muestra «Disponible» o «Sin jornada abierta» en pequeño. | operator-service-wizard.js, operator-service-lifecycle.js, operator-service-workspace-reactive-v1.js |
| Estados y acciones | Menú de estado según situación: asignar, reasignar, quitar asignación, arribar, desarribar, activar y finalizar. Menú Acciones: Ver servicio, Editar, Finalizar y Anular, según permisos y estado. | operator-services.js, operator-service-lifecycle.js |
| Confirmaciones | Confirmaciones centrales al finalizar y al activar, tanto desde Operaciones como desde el chofer. | operator-service-lifecycle.js, operator-service-bridge.js, operator-remito-review-v2.js |
| Peajes y excedentes | Aprobar actualiza la fila administrativa del cargo, con Cliente, concepto/peaje, importe y medio de pago. Rechazar la excluye y requiere motivo. El remito firmado se conserva. | operator-remito-review-v2.js, operator-service-commercial-addons-v1.js |
| Revisión integrada | Guardar conserva formulario y decisiones juntos. Finalizar bloquea antes de guardar si quedan diferencias sin resolver. Dejar pendiente conserva nota y cambios. Consulta del original en modo lectura. | operator-service-wizard.js, operator-remito-review-v2.js |
| Datos administrativos faltantes | Aviso temporal, campos marcados y foco en el primer dato faltante, sin perder lo cargado. | operator-service-wizard.js, operator-service-workspace-reactive-v1.js |
| Servicios activados | Liberan recursos y conservan el chofer y móvil históricos. Cierre con elección obligatoria Facturable / No facturable; este último exige motivo y queda excluido de Facturación. | operator-service-lifecycle.js, operator-services.js, migración SQL |
| Activados sin servicio | Permanecen visibles para Operaciones. Crear y finalizar registra el servicio y su clasificación en una transacción, sin una etapa manual de Arribado. | operator-service-wizard.js, operator-services.js, migración SQL |

Migración aplicada: `supabase/migrations/20260923155544_service_activation_review_v4.sql`.

Se renovaron las versiones de caché en Index.html, config.js y sw.js.

## Validación

Suite completa: **583 pruebas aprobadas, 0 fallas**.

- Verificación de sintaxis JavaScript y comprobaciones de seguridad del repositorio.
- Pruebas con PostgreSQL local (PGlite): liberación de recursos, responsables históricos, permisos, elección de facturación, motivo obligatorio, bloqueo de cierres antiguos, desarribo y creación de activados sin servicio.
- Pruebas de interfaz ejecutadas en un entorno simulado: autocompletado bidireccional, asignación manual, aprobación sin filas duplicadas, rechazo, bloqueo por diferencias y fallo al guardar.
- La migración se aplicó en Supabase. Las cuatro RPC nuevas no permiten ejecución anónima.
- Se actualizaron pruebas que esperaban los menús y la regla de facturación anteriores. Se normalizaron saltos de línea en cuatro archivos de pruebas para que sus verificaciones sean iguales en Windows y Linux.
- No se crearon servicios ni remitos de prueba en la base compartida. Las pruebas automatizadas no sustituyen una revisión visual completa con una sesión de Operador.

El asesor de Supabase mantiene avisos preexistentes: ocho funciones antiguas ejecutables por el rol anónimo y protección de contraseñas filtradas deshabilitada. Las cuatro nuevas funciones requieren sesión y validan el rol dentro del servidor. Referencias: [permisos de funciones](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [protección de contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Recorrido para corroborar

1. Reasignar un servicio: elegir chofer y luego móvil, y verificar el autocompletado en ambos sentidos.
2. Probar una selección sin jornada abierta y comprobar el aviso pequeño, manteniendo la asignación manual.
3. Abrir una revisión con un peaje distinto: aprobar y comprobar que queda una sola fila con los datos informados.
4. Intentar finalizar con una diferencia pendiente: debe aparecer el aviso y conservarse el servicio abierto, sin guardar ese intento.
5. Crear desde remito sin prestadora/base/tipo: comprobar aviso temporal y conservación de datos.
6. Activar un servicio: comprobar confirmación y responsables visibles. Al finalizar, elegir facturable o no facturable; el segundo caso debe pedir motivo.
