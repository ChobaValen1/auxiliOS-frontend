# Servicios: búsqueda y ayudas de la barra

## Próxima etapa acordada — 22/10/2026

Alcance acordado. Mantener colores, identidad visual, permisos y reglas de negocio. Validar primero en la versión de prueba; no promover a producción sin aprobación.

- Dar mayor jerarquía al código y la patente; cliente y prestadora como información secundaria.
- Mostrar origen y destino en dos líneas, con acceso a las direcciones completas sin abrir el servicio.
- Agrupar chofer y móvil; indicar explícitamente «Sin chofer» o «Sin móvil» cuando corresponda.
- Hacer visible el estado y la próxima acción disponible, según el flujo y los permisos existentes.
- No resaltar automáticamente acciones ni estados (última corrección del usuario). Mantener sólo el foco accesible habitual.
- Conservar búsqueda, filtros y posición de la lista al abrir un servicio y volver.
- **Estado del remito:** textos acordados en v530 (ver abajo). No confundirlo con el estado del servicio. No se cambian transiciones ni permisos.

Prioridad inicial: recorrido, asignación y acciones del listado de Servicios. Esta anotación no modifica la aplicación ni los registros.

## Visor nativo de recorrido — `mapa-nativo-v534-20261022`

Implementa el concepto aprobado: modal amplio con mapa de calles de Google, itinerario Base/Origen/Destino según facturación, kilómetros guardados y peajes del servicio. En móvil el mapa aparece primero; detalle desplazable debajo y acciones siempre accesibles. Colores/tokens originales, sin nueva identidad visual.

- Entrada: mapa de la fila compacta, columna Recorrido amplia y «Ver recorrido» arriba de Anular. Clic normal abre el visor; Ctrl/Cmd mantiene el enlace externo. Carga diferida de JS, CSS y SDK; una sola instancia visible y sin carga de Google en el listado.
- Lecturas autenticadas existentes: handoff v2 para ubicaciones/locks/cargos; contexto de prestadora por fecha y base exacta; catálogo de peajes sólo si hay cargos registrados. No se cambia SQL, permisos ni políticas. No se llama a guardados ni cotizaciones.
- Geometría: aprovecha polyline guardada cuando la proyección ya la entrega y coincide con las paradas. Si no está disponible, consulta el trazado en maps-proxy sin persistirlo; avisa «Trazado consultado ahora». No modifica km/importe guardados y no usa datos del wizard abierto. Si no hay coordenadas/método/trazado válido, no dibuja rectas como si fueran calles.
- SDK: Google Maps JavaScript, Mercator y polyline de Google sobre mapa Google con atribución propia visible. No se mezcla Routes con OpenStreetMap. Cámara ajustada una vez al circuito; zoom y gestos cooperativos provistos por Google. Botón para encuadrar de nuevo; seleccionar peajes no mueve la cámara.
- Peajes previstos vs informados separados, sin total conjunto. El remito es la fuente de los informados; las copias actual no se vuelven a sumar. Importes originales, no tarifas actuales del catálogo. Sin coordenadas exactas se muestran sólo en la lista. Coordenadas de catálogo no implican pasada confirmada ni inventan un tramo. Peajes compartiendo ubicación comparten pin; todos siguen seleccionables en la lista.
- Animación de 1,8 s, una sola vez y en orden de paradas; regreso discontinuo. Reducir movimiento muestra el trazado completo y ocultar pestaña termina la animación. Marcadores visibles desde el comienzo; no representa seguimiento en vivo.
- «Editar servicio» junto a Google Maps sólo con permiso actual y lock de edición válido en un servicio abierto. Abre el editor existente, que vuelve a validar en servidor. El visor no cambia por sí mismo el servicio.
- Cierre con Escape, devolución del foco, fondo inerte, bloqueo/restauración de scroll y trap de Tab. Lecturas tardías tras cerrar o cambiar servicio se descartan. Fallas de SDK/configuración/red tienen mensaje, reintento y datos/direcciones conservados.
- Clave: Vercel genera browser-map-config.json en build leyendo únicamente GOOGLE_MAPS_BROWSER_API_KEY. No se descifra por herramientas ni se commitea; nunca usa GOOGLE_MAPS_API_KEY. La clave de navegador es intencionalmente pública y debe mantenerse restringida por dominio/API. Se confirmó que está sólo en Preview. Service worker no cachea configuración ni contenido externo de Google.
- Pruebas: modelos puros de los tres circuitos, base elegida, dirección única, activados/manual, ausencia de coordenadas, decodificación inválida, cortes ordenados, importes/duplicados, permisos y configuración sin clave de servidor. QA de módulo real con RPC/SDK simulados: apertura desde listado, teclado/cierre, editor, peajes, errores/manual/sin coordenadas, respuesta tardía, animación/reduced motion, seis anchos en ambos temas y móvil horizontal. No hay escrituras reales en QA. Capturas en output/route-map-v534; las de QA se identifican como mapa simulado.

Fuentes técnicas: [Maps JavaScript](https://developers.google.com/maps/documentation/javascript/load-maps-js-api), [OverlayView](https://developers.google.com/maps/documentation/javascript/customoverlays), [políticas Routes](https://developers.google.com/maps/documentation/routes/policies), [RPC Supabase](https://supabase.com/docs/reference/javascript/rpc). La clave pública fue configurada por el usuario; sólo se leyó su nombre/alcance, nunca el valor.

## Estado pendiente uniforme — `estado-remito-v533-20261022`

- Los remitos sin enviar (not_started, draft o borrador documental sin otro estado conocido) muestran «Remito pendiente» en la misma etiqueta compacta de los demás estados: 120 × 26 px, una línea, texto corto «Remito pend…», tooltip completo y color neutro.
- No vuelve el cartel «Remito incompleto / Carga iniciada, todavía sin enviar». No se cambia ningún registro, transición ni permiso. Sólo presentación del estado documental en el listado, no un estado operativo nuevo.
- Pruebas de renderizado del borrador, ausencia del aviso retirado, tamaño uniforme y regresión de Servicios. Sólo preview.

## Retiro anterior del aviso de borrador — `estado-remito-v532-20261022` (presentación de draft reemplazada en v533)

- Se elimina por completo «Remito incompleto / Carga iniciada, todavía sin enviar» del listado y del detalle. No se reemplaza por otra tarjeta ni por «Remito pendiente».
- La etiqueta documental de draft se oculta; el borrador persistido, sus datos y las acciones existentes no cambian. Los demás estados conservan sus etiquetas compactas.
- Regresión del helper compartido, renderizado sin aviso y ausencia de mutaciones; QA aislado de Servicios sin escrituras reales. Sólo preview.

## Etiquetas compactas del remito — `estado-remito-v531-20261022`

- «Remito pendiente» se ve como «Remito pend…» y conserva el texto completo en tooltip y nombre accesible.
- Etiquetas documentales del listado con el mismo ancho (120 px, limitado por el contenedor), alto (26 px) y una sola línea. Si un texto supera el espacio disponible, se recorta con elipsis, sin aumentar la fila. Los remitos firmados conservan su acción y tooltip completo.
- No cambia el estado del remito ni del servicio, colores, reglas o permisos. Sólo preview.
- Pruebas de texto, tooltip, estilo y regresión del listado en seis anchos y ambos temas. Evidencias: `output/servicios-v531`.

## Selector de estado y textos del remito — `estado-remito-v530-20261022`

- El valor de Estado tiene flecha visible, superficie de hover redondeada (9 px), borde sutil y foco de teclado. Al abrir, la flecha gira; al cerrar vuelve. Sin movimiento del texto ni resaltado de la siguiente acción. Usa los colores y tokens actuales.
- Sólo se presenta como desplegable si existen opciones para ese servicio y rol; servicios sin opciones no llevan flecha ni cursor de botón. Conserva Enter/Espacio, navegación de menú y Escape con devolución del foco.
- Textos: not_started → «Remito pendiente»; draft/borrador → «Remito incompleto»; submitted → «Remito en revisión»; approved → «Remito aprobado»; observed → «Remito requiere correcciones». El remito firmado conserva su botón para abrir revisión, ahora sin sufijos repetidos «Ver/Revisar». Las excepciones siguen explícitas, no se presentan como aprobaciones documentales.
- Un viaje iniciado no prueba que exista un remito incompleto: se elimina esa inferencia del aviso de borrador.
- **Pendiente: «Creando remito…» mientras el chofer tiene abierto el formulario.** Inspección de sólo lectura confirmó que operator_services no registra apertura/cierre ni latido del formulario. user_presence sólo informa pantalla genérica y su lectura administrativa excluye operador. No se reutiliza ese acceso, no se amplían permisos y no se simula presencia con un borrador. Requiere implementar una señal protegida por servicio con cierre/caducidad y probarla entre chofer y operador antes de activarla. Preview y producción comparten base; esta entrega no modifica esa base.
- Verificación real de Operador detectó que list_operator_services omite document_status para ese rol. La bandeja documental existente sí devuelve todos los remitos vinculados. Tras una respuesta válida y completa de esa bandeja, la ausencia de un documento permite mostrar «Remito pendiente» sin modificar document_status ni hacer consultas nuevas. Si falta la lectura o existe un estado desconocido, no se inventa esa etiqueta.
- Verificación: pruebas de etiquetas, remitos firmados, excepciones, borrador sin falsa presencia y estilos condicionados a acciones; regresiones de rutas, filtros, historial, acciones y teclado. QA aislado con RPC simuladas y bloqueo de escrituras. Evidencias en `output/servicios-v530`. No se cambiaron importes, kilómetros, facturación, estados persistidos ni permisos.

## Recorrido según facturación — `recorrido-facturacion-v528-20261022`

- Eliminado por completo el resaltado automático del menú de estado. Se mantienen acciones, validaciones, confirmaciones y navegación por teclado existentes.
- La opción de Acciones se llama exactamente «Ver recorrido» y está inmediatamente encima de «Anular» cuando esta última está disponible.
- Vista compacta: un solo ícono de mapa para el recorrido completo. Vista amplia: columna independiente «Recorrido» inmediatamente antes de Acciones. Es una columna derivada de presentación: no agrega claves a las configuraciones persistidas de empresa/usuario ni cambia sus validadores.
- El enlace se obtiene de la misma lectura canónica del editor, `get_operator_service_context_v1`, para la prestadora y fecha programada del servicio. Selecciona la base por `billing_base_id`/`branch_id`, no por proximidad ni por la primera base devuelta.
- `base_origin_destination_base`: origen y destino de Maps son la base del servicio; paradas intermedias Origen y Destino, en ese orden. `base_origin`: Base → Origen. `origin_destination`: Origen → Destino, sin añadir base. Los conceptos de dirección única siguen el comportamiento del editor. Se usan coordenadas válidas o la dirección completa, nunca sólo el nombre de la base.
- Si el método es manual, no está configurado, falta una ubicación/base necesaria o falla la lectura, no se inventa un circuito ni se usa la posición del dispositivo. El ícono queda inactivo con una explicación. Actualizar lista permite reintentar.
- Lecturas compartidas por usuario/prestadora/día operativo (Buenos Aires), hasta tres simultáneas y caché de un minuto. Sólo se conservan en memoria datos de recorrido; no precios ni datos del cliente. Completar la lectura actualiza los íconos sin abrir el editor, cambiar filtros ni modificar registros. Actualizar lista invalida la caché.
- No hay migraciones, cambios de permisos ni escrituras de parámetros/servicios. No se modifica el cálculo de kilómetros o importes: Maps muestra el circuito según el método configurado. El estado del remito sigue pendiente.

Verificación: pruebas unitarias de los tres métodos, base elegida entre varias, ausencia de base/destino, método manual/desconocido, dirección única, coordenada cero y codificación/longitud de URL. Navegador con RPC simuladas: un mapa en compacta, columna en amplia, etiqueta/orden del menú, ausencia de resaltado, error/reintento, roles, teclado, historial/filtros/posición y seis anchos en ambos temas. Consulta real de sólo lectura confirmó el método y disponibilidad de coordenadas de la base seleccionada en los servicios activos. Evidencias: `output/servicios-v528`.

## Entrega anterior, reemplazada según devolución — `servicios-maps-estado-v527-20261022`

- Se retiran «Ver direcciones», el desplegable con direcciones repetidas y los botones principales de las filas.
- Se conserva origen/destino como ya se mostraban, sin repetir sus etiquetas. Se agrega un ícono de mapa junto a cada dirección: abre esa ubicación en Google Maps en otra pestaña. En Acciones (⋯), «Ver recorrido en Google Maps» abre Origen → Destino; si sólo hay una ubicación, abre esa ubicación. No llama a APIs, no usa ubicación del dispositivo como origen implícito y no navega hasta que el usuario elige el enlace.
- En el menú desplegable del estado, una sola acción disponible se resalta con el amarillo/ámbar existente: Sin asignar → Asignar; Asignado → Arribar; Arribado → Finalizar. Para logística tercerizada o remito firmado se resalta Finalizar si ya es la siguiente acción permitida. No se inventan transiciones ni se resalta Anular o una reversión. Perfiles de consulta no tienen acción de cambio destacada.
- Los diálogos de asignación, arribo y cierre siguen siendo los existentes, con sus validaciones y confirmaciones. Se revalida la elegibilidad si el servicio cambia con el menú abierto. Menús utilizables con teclado y Escape devuelve el foco.
- Se conservan mejoras de chofer/móvil, preferencias, filtros, historial, página y posición. El estado del remito continúa pendiente de definición. Publicación sólo en preview.

Verificación: enlaces HTTPS de host fijo, direcciones completas codificadas, falta/ocultación de ubicación, matriz de roles y estados, diálogos sin guardar, estado obsoleto, navegación por teclado, ausencia de botones redundantes y seis tamaños de pantalla en ambos temas. RPC de lectura simuladas, sin solicitudes externas ni escrituras de registros. Capturas: `output/servicios-v527`.

Formato de enlace: [documentación oficial de Maps URLs](https://developers.google.com/maps/documentation/urls/get-started).

## Entrega inicial de listado, reemplazada según devolución — `servicios-mesa-v526-20261022`

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
