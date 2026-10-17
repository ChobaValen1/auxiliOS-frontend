# Editar desde el servicio abierto en Historial

Build de prueba: `etapa2-historial-v479-20261017`. Rama autorizada: `claude/auxilios-3zj57q`. Sin promoción a producción.

- En Historial → abrir un servicio de prestadora, aparece «Editar» arriba a la derecha, junto a Volver. En servicios finalizados abre la corrección administrativa existente, la misma que ofrece el menú de la fila; no intenta reabrir el estado operativo ni cambiar Chofer/Móvil. El guardado conserva el circuito existente de Facturación.
- En la ficha de un particular finalizado aparece «Editar» en el pie. Abre el formulario de particulares. En ese estado la API existente sólo modifica presupuesto, datos de facturación y captación; los demás campos quedan bloqueados para no ofrecer cambios que la base no guardaría. No se vuelve a persistir la selección de conceptos de un particular cerrado. No agrega cobros ni permite registrar uno en un servicio cerrado.
- Las reglas de edición histórica se comparten con el menú de la fila: Administración u Operaciones; estado Finalizado y facturación `not_ready`, `pending` o `reviewed`. Anulados, facturados y los perfiles de consulta no ofrecen Editar. El clic también revalida el permiso actual.
- Se respetan las validaciones y auditoría del backend. Se inspeccionaron las definiciones vigentes de las funciones de lectura/corrección de finalizados y de presupuesto particular con consultas de sólo lectura. No se aplicaron migraciones, cambios de permisos ni escrituras en registros reales.

## Verificación

Cuatro pruebas nuevas de elegibilidad, estados/perfiles, acceso desde Ver servicio y editor correcto. Suite completa: 905 pruebas, 901 correctas y los cuatro fallos previos de saltos de línea de Windows documentados en las entregas anteriores.

QA de navegador con módulos reales y RPC simuladas: botón en 1440/390 px, acceso al contexto de corrección de finalizados, guardado con la API canónica, Chofer/Móvil bloqueados, anulados/facturados ocultos, Supervisión sin edición y Operaciones con edición. Particular finalizado con presupuesto editable y datos de servicio bloqueados; particular facturado sin Editar. No se guardaron servicios reales.

Capturas en `output/etapa-1/historial-editar-desktop.png` y `historial-editar-mobile.png`, en la carpeta principal del trabajo.
