# Correcciones de recursos e ingresos activados

Versión: `recursos-activados-v134-20260924`.

## Cambios y causas

| Problema | Causa encontrada | Corrección | Archivos |
|---|---|---|---|
| Chofer ↔ móvil deja de completar | La grilla recarga referencias cada 30 segundos y reemplaza los objetos que contenían la pareja de jornada. | Se conserva una consulta de disponibilidad independiente para ambos sentidos y para los avisos pequeños. La asignación manual sigue disponible. | `operator-service-wizard.js` |
| Finalizado muestra Sin asignar | Al cerrar se liberan los recursos; la lista y el formulario consultaban exclusivamente la asignación actual. | Consulta del último responsable del historial, o del registro de activación. Los campos de asignación actual permanecen libres. El formulario dice Chofer/Móvil de la salida. | Migración `20260924163151_service_responsibles_and_intake_edit_v1.sql`; `operator-service-workspace-reactive-v1.js` |
| Ingreso activado sin peajes ni excedentes editables | Se ocultaba el panel de cargos y se utilizaba la revisión administrativa de remitos firmados, cuyo contenido no recibía el RPC de creación de activados. | El ingreso activado utiliza el formulario comercial normal y envía `commercial_addons` al crear y finalizar. Permite prestadora, base, servicio, cliente, direcciones, conceptos, peajes y excedentes; conserva al chofer/móvil original como responsables. | `operator-service-wizard.js`; `operator-service-commercial-addons-v1.js` |
| Elección de facturación fuera de lugar | El selector estaba fuera de las columnas del formulario. | Tarjeta de cierre en la tercera columna, con Facturable → Facturación y No facturable → Historial, y motivo obligatorio para la segunda opción. Conserva selección y motivo al editar cargos. | `operator-service-workspace-reactive-v1.js`; `operator-service-commercial-addons-v1.js/.css` |

Los peajes usan las tarifas vigentes del catálogo, como la creación normal; los excedentes permiten ingresar su importe. El remito original no se modifica.

## Verificación

- Suite completa: **593 pruebas aprobadas**, ninguna fallida.
- Verificación posterior del controlador y formulario: **18 pruebas aprobadas**.
- `npm run check`: sintaxis y seguridad correctas.
- Nuevas regresiones: refresco de referencias con autocompletado en ambos sentidos; edición y envío completo de peajes/excedentes de un activado; consulta histórica de responsables en PostgreSQL sin volver a ocuparlos.
- Navegador local con el controlador, formulario, componentes y estilos reales, usando respuestas simuladas: autocompletado después del refresco; selección inversa; edición de prestadora; fila de peaje con pagador y pago; clasificación y motivo; inspección visual del diseño. Sin errores de consola observados.
- Base conectada, consultas de lectura: **12 de 12 servicios finalizados sin asignación actual recuperan su pareja histórica**. `list_operator_services` devuelve nombre de chofer y móvil en los 12.
- Migración aplicada y permisos del helper restringidos. El chequeo de asesores no señaló el helper nuevo.

No se crearon ni finalizaron servicios reales para estas pruebas. La comprobación interactiva de Operaciones se hizo localmente con respuestas simuladas; la pestaña del usuario estaba en el rol Chofer. El guardado completo contra la base conectada de un ingreso real queda para su uso operativo.

## Qué corroborar en la nueva versión

1. En Nuevo servicio o Reasignar, elegir un chofer con jornada abierta: debe completar móvil. Repetir comenzando por el móvil y dejar el formulario abierto durante un refresco.
2. Abrir un finalizado en Historial: debe mostrar quién hizo la salida; los recursos siguen disponibles.
3. Abrir un ingreso activado, completar los datos, agregar un peaje y un excedente, elegir el destino y crear/finalizar. Reabrir y corroborar los cargos.
4. Para No facturable, exigir motivo y mostrarlo en Historial. Para Facturable, aparecer pendiente en Facturación.
