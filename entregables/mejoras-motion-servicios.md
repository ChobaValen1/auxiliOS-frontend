# Servicios: búsqueda y ayudas de la barra

Versión de prueba: `motion-servicios-v519-20261022`.

- `/` enfoca la búsqueda cuando Servicios está visible; no interrumpe la escritura ni un diálogo abierto.
- La búsqueda tiene nombre accesible y botón para limpiarla. Escape limpia el texto y mantiene el foco. Ambos usan el evento original de filtrado y no cambian los otros filtros.
- Actualizar indica la carga real con el ícono y una línea ámbar, anuncia el estado y evita clics repetidos. Se libera al terminar, también cuando la operación falla; los mensajes de error siguen a cargo del módulo original.
- Las ayudas de los botones de la barra tienen borde, funcionan con foco de teclado, se cierran con Escape y se mantienen dentro del viewport.
- Se conservan paleta, identidad, datos y navegación. Sin cambios de backend ni escrituras de registros. Esta entrega se publica sólo en preview.

## Revisión

En Servicios, pulsar `/`, buscar y limpiar con el botón o Escape. Usar Tab para llegar a los botones Personalizar columnas y Actualizar; Escape cierra la ayuda. Actualizar muestra el estado de carga. En un modal abierto, `/` no lleva el foco al buscador.

Validación: TypeScript y compilación; QA de navegador con la barra extraída del módulo real, eventos de búsqueda, ciclo de carga simulado, foco de modales, ayudas, viewport y diseño móvil. La sesión de preview se verifica aparte, sin guardar datos.
