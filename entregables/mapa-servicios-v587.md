# Mapa de Servicios · ajuste v587

28/10/2026. Cambios solicitados después de probar la V1 en producción.

- **Lista / Mapa** está en el renglón de búsqueda y filtros, al extremo derecho. Sólo se ofrece en Activos; Historial utiliza la lista habitual. El enlace posterior al cierre abre el historial filtrado y permite volver al mapa anterior.
- El mapa muestra simultáneamente todos los orígenes y destinos verificados de los servicios activos que coinciden con los filtros. Al seleccionar una ficha se conserva la vista general. Los puntos coincidentes muestran cuántos servicios comparten esa ubicación y permiten recorrerlos con pulsaciones sucesivas.
- Los trazados origen → destino se consultan automáticamente al abrir Mapa, con un máximo de tres solicitudes simultáneas. Se reutilizan durante la sesión y no se recalculan por el refresco de estados. Cambiar direcciones invalida su geometría. Al salir de Activos se deja de procesar la cola. Los errores se indican y se reintentan únicamente por acción del usuario.
- Cada móvil tiene un color estable al filtrar, actualizar o seleccionar. La leyenda está abajo a la izquierda; diferencia también tercerizados y servicios sin móvil (gris discontinuo). La selección aumenta el grosor del trazado y conserva el color del móvil.
- La vista ocupa el espacio disponible de la aplicación, considerando la barra inferior del teléfono y los cambios de tamaño. El mapa y las acciones quedan fijos; los paneles de lista, detalle y leyenda permiten desplazamiento interno cuando el contenido no entra. Los menús se limitan a la altura disponible.

No hay cambios de base de datos ni de permisos. Se conservan las acciones y reglas canónicas de Servicios. Las ubicaciones sin coordenadas permanecen en las fichas; no se inventan puntos ni trazados.

Validación: pruebas del mapa y del visor, controles de sintaxis y seguridad, y QA en Chromium de escritorio/tablet/celular. Comprueba rutas automáticas, concurrencia máxima, caché, descartes de respuestas obsoletas, error y reintento, colores por móvil, filtros, ausencia de scroll de página, acciones operativas, historial sólo en lista, supervisión y cierre de sesión. Los datos del QA son sintéticos; no se alteran servicios productivos.

Build `services-map-v587-20261028`; caché `auxilios-v587-services-map`; service worker `v294`. El despliegue anterior v586 permite revertir el frontend sin cambios en la base.
