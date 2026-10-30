# Mapa de Servicios · zoom y paneles v589

29/10/2026. Al seleccionar una ficha, un marcador o una línea, el mapa encuadra el recorrido completo del servicio elegido. Las demás rutas permanecen dibujadas y conservan sus colores. **Ver todos** recupera la vista general de los servicios filtrados; volver a la lista lateral también recupera ese encuadre.

Si el trazado todavía está cargando, se muestran primero sus extremos y se ajusta el encuadre al recibir la ruta. Una respuesta atrasada de otro servicio o un refresco de estados no cambia la vista seleccionada. Mover o acercar el mapa manualmente cancela el ajuste pendiente. Los servicios de un solo punto se acercan a nivel de calle; los que carecen de coordenadas conservan la posición actual del mapa.

En escritorio, la lista pasa de 280 px a 320–380 px y el detalle de 300 px a 360–450 px, según el ancho disponible. En tablet, el panel compartido crece hasta 380 px. Las direcciones completas pueden ocupar varias líneas, el móvil y el horario comparten una fila y los datos operativos se distribuyen en dos columnas. Se mantiene la pantalla fija con desplazamiento interno de los paneles. Las capas del mapa quedan recortadas a su superficie para no invadir las fichas al hacer zoom.

Validación: sintaxis y seguridad, pruebas del mapa y visor, y Chromium en escritorio, notebook, tablet y celular. Incluye selección desde ficha/marcador/línea, vuelta al encuadre general, geometría demorada, cambio de selección, intervención manual, punto único, falta de coordenadas, paneles amplios, direcciones largas, ausencia de desbordamiento y flujos operativos existentes. El SDK y los servicios de QA son simulados; no se alteran servicios de producción.

Base integrada: main `157c2092e34e61f4c330b70dd899635f6068b91d` (incluye la actualización de CI y deuda U17). No hay cambios de base de datos. Build `map-focus-v589-20261029`, caché `auxilios-v589-map-focus`, service worker 296.
