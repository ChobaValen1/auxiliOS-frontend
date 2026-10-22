# Servicios: búsqueda y ayudas de la barra

Versión de prueba: `servicios-operativos-v520-20261022`.

## Corrección y mejoras operativas

- Cabecera corregida: se elimina el `top: -18px` heredado y se separan acciones y filtros con áreas de grilla explícitas. No dependen del espacio que casualmente quede libre. El título de Historial también tiene su propio espacio.
- La búsqueda incluye cliente, chofer asignado, móvil y patente del móvil, además de los campos anteriores. Ignora tildes y mayúsculas, y combina términos: `jose cardinal` busca ambas palabras dentro del mismo servicio. No amplía los datos ni los permisos de la consulta.
- El resumen muestra coincidencias reales sobre los servicios cargados, y el rango de resultados en cada página del Historial. Los contadores de estados siguen representando la cola completa.
- Los filtros aplicados, incluido el estado, aparecen como etiquetas removibles. Quitar uno conserva los demás y devuelve el foco a su control.
- Restablecer vista elimina filtros y estado, conserva Activos/Historial y vuelve a la primera página. Las búsquedas sin coincidencias ofrecen esta salida directamente.
- Se sincroniza el botón de limpiar búsqueda cuando otro control cambia el texto de forma programática.

Verificado con el módulo real y sus estilos, RPC de lectura simuladas: búsqueda combinada, tildes, cliente/chofer/móvil, filtros independientes, recuperación vacía, estados y paginación. Sin superposición entre cabecera, selector, contador y acciones en 1440, 1060, 768, 720, 390 y 320 px, tanto en claro como en oscuro. Capturas: `output/servicios-v520`.

## Herramientas de la barra

- `/` enfoca la búsqueda cuando Servicios está visible; no interrumpe la escritura ni un diálogo abierto.
- La búsqueda tiene nombre accesible y botón para limpiarla. Escape limpia el texto y mantiene el foco. Ambos usan el evento original de filtrado y no cambian los otros filtros.
- Actualizar indica la carga real con el ícono y una línea ámbar, anuncia el estado y evita clics repetidos. Se libera al terminar, también cuando la operación falla; los mensajes de error siguen a cargo del módulo original.
- Las ayudas de los botones de la barra tienen borde, funcionan con foco de teclado, se cierran con Escape y se mantienen dentro del viewport.
- Se conservan paleta, identidad, datos y navegación. Sin cambios de backend ni escrituras de registros. Esta entrega se publica sólo en preview.

## Revisión

En Servicios, pulsar `/`, buscar y limpiar con el botón o Escape. Usar Tab para llegar a los botones Personalizar columnas y Actualizar; Escape cierra la ayuda. Actualizar muestra el estado de carga. En un modal abierto, `/` no lleva el foco al buscador.

Validación: TypeScript y compilación; QA de navegador con la barra extraída del módulo real, eventos de búsqueda, ciclo de carga simulado, foco de modales, ayudas, viewport y diseño móvil. La sesión de preview se verifica aparte, sin guardar datos.
