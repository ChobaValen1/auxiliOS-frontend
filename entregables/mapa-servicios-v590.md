# Servicios · mapa v590

El mapa ocupa el espacio libre de la pantalla. La lista y el detalle dejan de ser dos paneles permanentes: Servicios abre una ficha paginada; seleccionar un servicio muestra un único panel de detalle y encuadra el recorrido. Cerrar devuelve el ancho al mapa.

Los filtros de mapa ocupan una fila compacta en escritorio (dos en teléfono). Estado reemplaza la tira de pestañas y conserva los filtros y conteos canónicos. La lista e Historial conservan su presentación.

El mapa permanece oscuro con cualquier tema. Los puntos usan círculo para origen y bandera para destino; el seleccionado muestra el código real y móvil. Los colores por móvil, todas las rutas y los puntos coincidentes se conservan. La leyenda y cadena se paginan, sin scroll. Resumen, Seguimiento y Cadena reparten el detalle con las acciones siempre al pie. En teléfono el panel se superpone al mapa y Cerrar lo vuelve a mostrar.

Validación: pruebas unitarias de mapas; QA Chromium con datos sintéticos y SDK simulado (zoom, estados, filtros, paginación, temas, roles, historial, concurrencia/caché y vista compacta); comprobaciones de seguridad. No representa GPS ni una posición del móvil en tiempo real.
