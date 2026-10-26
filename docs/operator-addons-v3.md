# Excedentes, servicios adicionales y comisiones · versión de pruebas

## Formulario

- Conserva las tres columnas y los componentes visuales de AuxiliOS.
- Excedentes: conceptos fijos y conceptos habilitados de la Prestadora. Las ventas sin tarifa pueden ingresarse con importe manual; los servicios adicionales tarifados requieren una tarifa disponible.
- Cada cargo muestra concepto, cantidad/duración, importe por unidad, cobrador y total. Hora Trabajo y Hora Espera se ingresan en minutos y se guardan en horas; “Otro” requiere descripción.
- Los errores se muestran junto al campo. Cambiar de campo conserva los importes; cambiar un concepto adicional conserva su fila.
- “Agregar servicio adicional” identifica los conceptos con código propio. Se solicita y valida el código según Configuración, incluido `code_mode=manual`.

## Comisiones (RPC v3, habilitación de base requerida)

- La comisión sigue al chofer responsable del servicio: firmante, responsable del activado, asignado o última asignación anterior al cierre. El usuario que carga la venta no determina el beneficiario. Se mantienen las asignaciones de comisión de Sueldos.
- Las ventas de un servicio finalizado usan, en orden, la corrección administrativa, los cargos reales o el remito firmado; los servicios adicionales tarifados complementan conceptos que no tienen una venta registrada como excedente.
- Las representaciones de un mismo concepto en excedentes e items no se suman dos veces. Varias líneas reales del mismo concepto sí suman su cantidad.
- Excedentes no cobrados o cobrados por la Prestadora no generan comisión de venta. Los servicios adicionales tarifados se toman de su subtotal al finalizar.
- Los cargos excluidos/rechazados no se recuperan desde el remito original. Un remito tardío no vuelve a comisionar el mismo servicio en otro mes.
- Captación de particulares y comisiones de servicio principal conservan sus reglas actuales.
- Las funciones v3 son nuevas y de consulta. No sustituyen las RPC v2 utilizadas en producción, ni actualizan liquidaciones guardadas. La rama de pruebas usa estas funciones tanto en Sueldos como en el resumen del chofer.
- “Chofer responsable” es el beneficiario de estas ventas. Elegir un vendedor distinto del responsable por cada venta requiere una regla de negocio y atribución separadas; no se reutiliza el campo de captación para este fin.

## Verificación

- `npm run check`: sintaxis y controles de seguridad.
- `node --test test/operator-sales-commissions-v3.test.js`: pruebas PostgreSQL aisladas, comisión porcentual, responsable, duplicados, rechazo, corrección, mes y permisos.
- `node scripts/qa/operator-addons-v3.cjs`: Chromium/Playwright con datos sintéticos y sin escrituras en la base; selección, código propio, cantidades por hora, importes, errores, eliminación, consulta y desbordamiento en escritorio/móvil. Requiere Playwright y Chromium disponibles en el entorno de QA.
- Capturas en `assets/ui-review/operator-addons-v3/`.
- La suite general se compara con la misma revisión previa para distinguir los fallos preexistentes.

## Estado de publicación

El usuario autorizó expresamente agregar las funciones nuevas de consulta en la base compartida. La migración se aplicó sin modificar las funciones v2 ni los datos guardados. La interfaz usa el contexto anterior como respaldo durante la actualización del catálogo de funciones. El cálculo v3 se activa únicamente en esta rama de pruebas; producción sigue usando las RPC v2.
