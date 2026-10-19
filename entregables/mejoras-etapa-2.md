# Segunda entrega — combustible y reportes en preview

Fecha: 17/10/2026. Build: `etapa2-v476-20261017`.
Destino autorizado: rama `claude/auxilios-3zj57q`, proyecto Vercel `auxilios-frontend`.

## Disponible para revisar

- Combustible: filtros combinables por fechas inclusivas, medio de pago y texto (estación, app, número de carga o motivo de anulación). La búsqueda ignora acentos. Aplicar filtros reinicia la paginación; Limpiar restaura el historial. Una fecha desde posterior a hasta muestra un error sin cambiar el resultado aplicado.
- El resultado muestra cantidad, litros e importe de todas sus páginas. El pie conserva los totales de todo el historial activo y lo aclara expresamente. Las anuladas siguen separadas, fuera del total activo; el rinde sigue calculándose sobre el historial activo completo.
- Combustible: Excel y CSV exportan todas las páginas del resultado aplicado, con campos numéricos, móvil, jornada, estado y motivo de anulación. CSV usa UTF-8 con BOM, separador punto y coma, coma decimal, escape de comillas/saltos y protección de textos que podrían interpretarse como fórmulas. Estas exportaciones son de lectura, también para Supervisión.
- Facturación: flechas para ordenar las columnas del Excel. La selección y el orden se conservan en este navegador al exportar exitosamente. Se respetan los tres alcances existentes: visibles, seleccionados y todo lo filtrado. Los datos y la suma canónica de peajes no se recalculan en el navegador.
- Columna opcional «Nombres de peajes (prestadora)», desmarcada por defecto. Sigue la fuente real/planeada de la cotización canónica, excluye peajes exclusivamente del particular y agrupa nombres repetidos con su cantidad. La columna «Peajes» conserva el importe de la cotización, que puede incluir reglas contractuales y no equivale necesariamente a la suma bruta de tickets.
- La exportación impide descargar silenciosamente un archivo incompleto si un servicio dejó de estar disponible. Cancelar mientras se prepara no descarga después ni interfiere con una nueva exportación. Escape y navegación por teclado se mantienen dentro del selector.
- Se mantienen los tokens oscuros/ámbar, tipografía, tablas y botones del sistema actual. Revisado en escritorio y celular.

## Seguridad y pendientes

No se aplicaron migraciones, cambios de permisos, cambios de Edge Functions ni escrituras de datos. El frontend de prueba sigue compartiendo Supabase con producción: editar o guardar registros desde allí cambia datos reales. Las pruebas de esta entrega usaron datos y conexiones simuladas.

La base actual no tiene un campo ni asociación para conservar el ticket de combustible. El alta `create_driver_fuel_record_v1` permite sólo Chofer; no se reutilizó desde Administración ni se evitó su control de permisos. Quedan pendientes el alta administrativa vinculada a jornada y el adjunto/visor de tickets hasta disponer de un backend de prueba aislado o autorización específica para esos cambios.

El proxy de Maps actual sólo ofrece autocomplete, place y route; resolver dirección a partir de coordenadas requiere ampliar ese backend. No se agregó un proveedor externo ni se simuló una dirección validada. También siguen pendientes las mejoras generales de exportación en Jornadas/Facturas, configuración comercial de conceptos, Tercerizados y calculadora de particulares. Las reglas de pago a terceros y cálculo al particular deben definirse antes de automatizar importes.

## Verificación

- `npm run check`: sintaxis y seguridad correctas.
- Pruebas focalizadas: 46 correctas.
- Suite completa: 890 pruebas, 886 correctas y los mismos cuatro fallos previos de saltos de línea de Windows ya documentados en la primera entrega. Sin regresiones nuevas identificadas.
- `scripts/verify-stage2.cjs`: módulos reales con RPC y SheetJS simulados para verificar datos entregados al exportador, filtros, paginación, orden y selección persistidos, nombres e importe de peajes, error/reintento, archivo parcial impedido, cancelación asíncrona y vista de 1440/390 px. Descarga CSV real comprobada. No sustituye una validación de archivo XLSX con datos operativos del usuario.
- Evidencias locales: `output/etapa-2` en la carpeta principal del trabajo (capturas, CSV y log de pruebas).

## Recorrido de revisión

1. Control del camión → Combustible: aplicar un período, medio y búsqueda; comparar el subtotal del resultado con el pie del historial completo.
2. Descargar Excel o CSV estando en la segunda página y comprobar que incluya todas las cargas filtradas.
3. Alternar Activas/Anuladas y limpiar filtros; comprobar los totales y las acciones ya existentes.
4. Facturación → Exportar: elegir pocas columnas, moverlas con las flechas y descargar. Volver a abrir para verificar que conserva orden y selección.
5. Activar «Nombres de peajes (prestadora)» y «Peajes» para revisar nombre/cantidad e importe canónico por servicio.
6. Aprobar o pedir ajustes en preview. No se promueve a producción sin aprobación posterior.
