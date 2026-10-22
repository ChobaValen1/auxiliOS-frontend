# Servicios: búsqueda y ayudas de la barra

## Próxima etapa acordada — 22/10/2026

Alcance acordado. Mantener colores, identidad visual, permisos y reglas de negocio. Validar primero en la versión de prueba; no promover a producción sin aprobación.

- Dar mayor jerarquía al código y la patente; cliente y prestadora como información secundaria.
- Mostrar origen y destino en dos líneas, con acceso a las direcciones completas sin abrir el servicio.
- Agrupar chofer y móvil; indicar explícitamente «Sin chofer» o «Sin móvil» cuando corresponda.
- Hacer visible el estado y la próxima acción disponible, según el flujo y los permisos existentes.
- Dejar una acción principal visible y agrupar las acciones secundarias permitidas en un menú.
- Conservar búsqueda, filtros y posición de la lista al abrir un servicio y volver.
- **Estado del remito:** anotar para modificar. Revisar su presentación y el flujo de cambio de estado; los estados, transiciones y permisos concretos quedan por definir con el usuario antes de modificar la lógica. No confundirlo con el estado del servicio.

Prioridad inicial: recorrido, asignación y acciones del listado de Servicios. Esta anotación no modifica la aplicación ni los registros.

## Entrega de listado — `servicios-mesa-v526-20261022`

- Recorrido compacto con Origen/Destino identificados y direcciones desplegables dentro de la fila. Funciona con clic y teclado sin abrir el servicio; respeta las columnas y los detalles de ubicación ocultos por configuración.
- Chofer y móvil agrupados, con «Sin chofer» y «Sin móvil» explícitos. Conserva tercerizados y usa los responsables históricos cuando la asignación activa ya fue liberada. Un recurso con ID válido pero referencia no disponible no se presenta como sin asignar.
- Acción principal visible según la elegibilidad del lifecycle existente: Asignar, Arribo manual o Ver servicio. Asignar/Arribo abren sus diálogos canónicos, no confirman automáticamente ni agregan RPC. Se vuelve a validar el estado antes de ejecutar la acción; Supervisión y Facturación sólo reciben Ver servicio.
- Acciones secundarias y controles de negocio existentes conservados. Menú con foco de teclado, Escape devuelve el foco al disparador, posición calculada según su altura real. En escritorio las acciones permanecen accesibles al desplazar la tabla; en móvil ocupan el pie de cada tarjeta y no tapan el código.
- Conserva Activos/Historial, filtros, página y desplazamiento al salir del módulo y volver. Los recorridos abiertos se conservan en el refresco del listado. Mayor jerarquía de código y patente sin cambiar paleta.
- Sin modificaciones a los estados/transiciones del remito. Ese punto sigue pendiente de definición con el usuario. Sin cambios de backend, consultas, permisos o registros reales.

Verificación: `scripts/verify-service-list.cjs` usa los módulos reales de Servicios y lifecycle, RPC de lectura simuladas y bloquea cualquier otra RPC o solicitud externa. Comprueba direcciones con mouse/teclado, diálogos sin confirmar, matriz de estados y logística, roles, acción obsoleta, preferencias, navegación y paginación; diseño en 1440/1060/768/720/390/320 px y ambos temas. Evidencias: `output/servicios-v526`.

Las pruebas heredadas `phase3b-service-lifecycle` y `service-times-visibility` aún esperan el prefijo de caché `auxilios-billing-phase2-v…`, que ya no existe en el HEAD previo v524. Fallos preexistentes de esas aserciones, no del comportamiento de Servicios. No se alteraron para esta entrega.

## Entrega anterior

Versión de prueba: `servicios-operativos-v521-20261022`.

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
