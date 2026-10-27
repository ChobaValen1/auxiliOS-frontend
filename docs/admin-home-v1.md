# Inicio administrativo

Nueva primera pestaña para Administración y Supervisión. Conserva Resumen, Tendencia, Operaciones y Salud de la flota. Las consultas son de lectura: no modifican servicios, facturas ni liquidaciones.

## Lectura y períodos

- Servicios: altas de hoy. Sin asignar y En curso: estados actuales, sin limitar por fecha programada. Finalizados: cierres de hoy, sin activados.
- El día se calcula en America/Argentina/Buenos_Aires. Ayer termina a la misma hora local; los estados anteriores se reconstruyen desde eventos. Cuando falta historia, se indica que no hay base comparable.
- Km facturados: billable_distance_km congelado en las líneas de facturas generadas ese día. No usa km reales ni sustituye datos faltantes por estimaciones. Excluye líneas liberadas y documentos anulados/acreditados en el corte correspondiente.
- El resumen mensual usa facturas generadas en ese mes, vigentes al consultar y netas de notas de crédito. ARS y USD se muestran por separado. Por facturar es el importe estimado actual de los servicios de prestadoras pendientes; no depende del mes seleccionado.
- Los contadores se agregan en la base, sin heredar el límite de 500 filas de la pantalla operativa. Se excluyen datos de prueba.

## Top del día

Dos listas de hasta cinco posiciones: choferes y móviles. Orden inicial por servicios finalizados; selector alternativo por km facturados. El chofer se atribuye al remito y el móvil a la jornada del viaje, con asignación del servicio como respaldo. Se excluyen activados, tercerizados y pruebas. Los km pertenecen a esos servicios y pueden ser cero si aún no se facturaron.

En escritorio se ven las dos tablas. En móvil hay botones Choferes/Móviles. El mes financiero nunca cambia la fecha del Top.

## Acciones y estados

Los accesos llevan a Servicios sin asignar, Remitos a revisar, ingresos sin servicio, Facturación, Salud de la flota o la primera jornada abierta durante más de 12 horas. Se conservan los controles y permisos de cada módulo. El service usa el cálculo canónico existente de Salud de la flota.

Errores de flota no ocultan el resto del Inicio. Un refresco fallido señala que la última lectura puede estar desactualizada. El primer error no se presenta como valores cero; una consulta nueva prevalece sobre respuestas anteriores. El gráfico ofrece una tabla de valores diarios para teclado y lectura asistida.

## Validación

PGlite cubre zona horaria, corte comparable, historia faltante, snapshots de kilómetros, facturas anuladas, créditos, monedas, ranking, responsables históricos, límites de tablas y permisos. Chromium comprueba escritorio/móvil/tableta, acciones, filtros, errores y respuestas fuera de orden. También se verificó la RPC con datos reales y una consulta de solo lectura.
