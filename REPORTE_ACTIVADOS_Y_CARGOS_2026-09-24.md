# Activados e informe de cargos del remito
Fecha: 24/09/2026. Versión: `revision-resultados-v133-20260924`.

## Resultado

Los activados tienen una ficha propia dentro del servicio, con motivo, detalle, chofer y móvil de la salida, fecha y situación administrativa. El formulario diferencia un activado pendiente de cierre de uno finalizado.

Al cerrar:
- **Facturable:** estado Finalizado y pendiente en Facturación.
- **No facturable:** estado Finalizado, excluido de Facturación y disponible en Historial. El motivo es obligatorio.
- Ambos dejan de aparecer en Activos. El historial conserva la trazabilidad también de los facturables.
- El modal explica el destino de cada opción y cambia el texto de confirmación según la elección. Si el formulario tiene cambios sin guardar, avisa antes de abrir el cierre.

En la revisión de remitos:
- **Aprobar** actualiza el cargo administrativo y retira su aviso de diferencia.
- **Rechazar** pide motivo y requiere pulsar **Confirmar rechazo**. Hasta confirmar, la diferencia sigue pendiente y el cargo se conserva.
- La decisión pasa a **Ver cargos del remito firmado**, con Aprobado, Rechazado o Aprobado con cambios cuando corresponde, importe original, medio de pago y motivo.
- El informe distingue una decisión **Sin guardar** de una **Decisión guardada**.
- Las decisiones guardadas se recuperan al volver a abrir el servicio. En un servicio finalizado se muestra el resultado definitivo de la revisión.
- El remito firmado permanece intacto.

## Inconsistencias corregidas

| Hallazgo | Corrección |
|---|---|
| Los activados finalizados seguían incluidos en Activos. | El filtro diferencia activados abiertos y cerrados. |
| Un activado podía contarse también como Arribado por su estado técnico. | Las pestañas y sus cantidades separan activados de arribados. |
| Los activados anulados podían quedar fuera del historial. | Se incluyen como anulados según la configuración del historial. |
| Una diferencia aprobada seguía mostrando sus botones de advertencia. | Se retira de pendientes y se muestra en el informe. |
| Rechazar quitaba el cargo antes de completar el motivo. | El rechazo se aplica recién después de confirmarlo con motivo. |
| La consulta en modo lectura no cargaba las decisiones de revisión. | Carga el informe y bloquea edición y cierre. |
| Una respuesta tardía podía corresponder a otro servicio. | Se descartan las respuestas de una carga anterior o de un formulario cerrado. |
| Una decisión previa podía seguir apareciendo después de una corrección del chofer. | Se omiten borradores anteriores al evento de corrección. |
| El cierre podía anunciar éxito sin verificar el destino devuelto. | Comprueba Finalizado y el estado de facturación esperado. |
| El ingreso activado mostraba controles de cargos que ese flujo no guardaba. | Presenta su ficha de activación y clasificación, sin esos controles. |

Se mantuvo la recuperación preexistente de servicios comunes con remito firmado pendiente de revisión: ese caso sigue visible en Activos aunque tenga un cierre anterior incompleto.

## Dónde se modificó

| Área | Archivos |
|---|---|
| Mesa de servicios, filtros y motivos visibles | operator-services.js |
| Ficha de activación e informe de cargos | operator-service-commercial-addons-v1.js y .css |
| Revisión individual, rechazo confirmado y carga de decisiones | operator-remito-review-v2.js |
| Modal de cierre y verificación del destino | operator-service-lifecycle.js y .css |
| Mensajes de creación y clasificación del ingreso | operator-service-wizard.js, operator-service-workspace-reactive-v1.js |
| Consulta persistente del informe y responsables históricos | supabase/migrations/20260924112634_service_review_report_v1.sql |
| Renovación de caché | Index.html, config.js, sw.js |
| Pruebas nuevas | test/service-review-outcomes.test.js y ampliación de test/operator-review-workspace.test.js |

## Pruebas realizadas

**590 pruebas aprobadas, 0 fallas.** Verificación de sintaxis JavaScript y controles de seguridad del repositorio aprobados.

Se verificaron filtros de Activos/Arribados/Historial, facturable y no facturable, permisos, rechazo sin motivo, aprobación sin duplicar peajes, recuperación de decisiones y consulta sin edición. Las pruebas locales con PostgreSQL verificaron el informe persistente, prioridad del resultado final, invalidación de borradores anteriores y rechazo de roles no autorizados.

En navegador local, utilizando los módulos y estilos reales con datos simulados, se recorrió:
1. La ficha de un activado pendiente.
2. Aprobar un peaje de 1.500 previsto en 1.000: una sola fila por 1.500, Cliente y Efectivo; aviso retirado e informe Aprobado.
3. Confirmar rechazo con motivo: cargo retirado de la matriz, informe Rechazado con el motivo y cero diferencias pendientes.
4. Revisión de legibilidad y ausencia de errores de consola.

La migración está aplicada en Supabase. El nuevo informe no admite ejecución anónima; exige sesión y valida el rol.

**Límite de la validación:** la prueba visual de las interacciones se realizó con datos simulados; no se cerraron ni alteraron servicios reales para probar. La suite incluye contratos de PostgreSQL con un esquema de pruebas, sin todos los triggers ajenos a este flujo.

Los avisos de seguridad preexistentes del proyecto siguen separados de este cambio: ocho funciones antiguas con permiso anónimo y protección de contraseñas filtradas deshabilitada. Referencias: [permisos de funciones](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [protección de contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Para corroborar en la nueva versión

Abrí un activado, verificá la ficha y finalizá con la clasificación correspondiente. Debe salir de Activos y quedar disponible en el destino indicado.

En una revisión con diferencias, aprobá una y rechazá otra con motivo. Los avisos individuales deben desaparecer; abrí **Ver cargos del remito firmado** para ver sus estados. Guardá y volvé a abrir el servicio para comprobar la persistencia.
