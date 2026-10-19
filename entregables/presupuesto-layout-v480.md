# Particular: composición del presupuesto · v480

Destino autorizado: rama `claude/auxilios-3zj57q`, entorno Preview. No publicar en producción.

## Cambios

- Primera columna: Datos del cliente, Datos del servicio (incluye vehículo y observaciones), Datos de asignación.
- Segunda columna: presupuesto, selección de pago previo y facturación; precio del servicio destacado al pie y saldo pendiente separado.
- Calculadora como acción del encabezado, en una ventana de la aplicación. Escape cierra sólo la herramienta; conserva el formulario, devuelve el foco y no aplica resultados sin confirmación.
- Se conserva la identidad oscura/ámbar de AuxiliOS y el formulario se apila en móviles.
- Sin cambios de RPC, permisos, migraciones ni reglas económicas.

## Verificación

- QA local con módulos y estilos reales y RPC simuladas: orden de secciones, importes, pago total/seña, factura, calculadora, foco, Escape, edición histórica y confirmaciones de la app.
- Pantallas de 320, 390, 560, 820 y 1224 px sin desbordamiento horizontal; precio visible en el estado inicial a 1224×692.
- Comprobación de sintaxis/seguridad y 15 pruebas focalizadas aprobadas.
- Suite general: 905 pruebas, 901 aprobadas; mismos 4 fallos previos por expectativas de saltos LF sobre archivos CRLF en Windows (fleet-truck-detail, operator-excess-concepts, remitos-admin-table-v2).

La versión de prueba comparte la base de datos real: las pruebas de interacción se hicieron sólo en una fixture local, sin crear servicios ni registrar cobros reales.
