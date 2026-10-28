# Mapa de Servicios · Revisión funcional del plan V1

28/10/2026. Revisión solicitada por el usuario después de aprobar el concepto y la demo. Las recomendaciones de este documento precisan y simplifican ese diseño. La revisión original se hizo sobre el código local. Implementación posterior: [V1 en v586 y validación](mapa-servicios-v1-implementacion.md).

## Conclusión

Mantener el mapa dentro de Servicios. La primera entrega debe ayudar a localizar **servicios**, identificar responsables y operar con los flujos existentes. La demo sirve como referencia visual, pero su máquina de estados, disponibilidad, remito y ubicaciones ficticias no se deben trasladar a producción.

Los cambios más importantes son respetar la cola real del chofer, distinguir ejecución de revisión administrativa, separar ruta operativa de recorrido facturable y eliminar la captura de posición como dependencia de esta entrega.

## Evidencia del código actual

| Hallazgo | Fuente local | Implicación |
|---|---|---|
| Activos/Historial dependen de estado y revisión del remito; un finalizado con remito pendiente de revisión puede seguir en Activos | `operator-services.js`: `activeServices`, `historyServices`, `pendingRemitoReview` | No filtrar solamente por `status === completed` |
| La cola del chofer usa `driver_queue_position`, excluye trabajos terminados para el chofer y considera servicios iniciados | `operator-services.js`: `driverQueue`, `driverDone`, `queueInfo` | La hora no sustituye el orden operativo; «cadena del móvil» puede ser una etiqueta incorrecta |
| Las acciones dependen de estado, remito, logística y permisos | `operator-service-lifecycle.js`: `quickActions`, `openAssignment`, `openArrival`, `openFinalize` | Reutilizar estas decisiones y formularios; no escribir otra lógica en el mapa |
| Arribo manual tiene motivo; cierre sin remito, cierre sin arribo, tercerizado y activado tienen caminos diferentes | `operator-service-lifecycle.js`: `openArrival`, `openFinalize`, `openSignedFinalize` | La secuencia de la demo es un caso, no una regla que bloquee excepciones existentes |
| El visor actual representa recorridos de facturación que pueden incluir base y retorno | `service-route-map.js`: `planFor` | No dibujar la geometría completa como si fuera solo origen → destino |
| El cálculo actual de rutas usa `TRAFFIC_UNAWARE` | `supabase/functions/maps-proxy/index.ts`: `computeRoute` | La duración existente no constituye un ETA con tránsito |
| Servicios se actualiza periódicamente cada 30 s mientras la pantalla está visible | `operator-services.js`: `init`, `loadServices` | V1 puede aprovechar esa actualización; el realtime del chofer no significa realtime del panel operador |
| La carga principal pide hasta 500 servicios y enriquece documentos por otra consulta | `operator-services.js`: `loadServices` | No prometer cobertura total ni dibujar datos parciales sin indicarlo; comprobar proyección por rol y paginación |
| Fecha/Hora del formulario usan `scheduled_for`; la vista también tiene horas reales y campos alternativos de arribo/fin | `operator-service-workspace-reactive-v1.js`: `syncFields`; `operator-services.js`: `cell` | «Horario pactado» no está probado como significado universal. Diferenciar hora del servicio, estimación y registro real |

## 1. Entrar a Servicios

**Mantener:** Activos/Historial y Lista/Mapa como decisiones independientes.

**Mejorar:** Lista como entrada inicial; recordar la última presentación elegida por usuario después de su primera elección. Cambiar presentación conserva búsqueda, filtros, selección válida y contexto. Al volver de la ficha, recuperar encuadre y selección si el servicio todavía pertenece al resultado.

**Eliminar:** módulo nuevo de navegación, selección automática arbitraria y filtro «Hoy» impuesto sobre Activos. Un trabajo pendiente de ayer sigue siendo operativo; los programados futuros mantienen la clasificación actual.

**Aceptación:** un servicio abierto de ayer aparece tanto en Lista como en Mapa con los mismos filtros. Cambiar presentación no dispara una acción ni modifica datos.

## 2. Filtrar, buscar y comprender la cobertura

**Mantener:** búsqueda y filtros actuales de estado, prestadora, chofer y móvil; período en Historial. Usar el mismo resultado autorizado que Servicios, con su información documental enriquecida.

**Mejorar:** contador que distinga servicios filtrados, servicios con punto válido y servicios sin coordenadas. Por ejemplo: «18 servicios · 16 ubicables · 2 sin coordenadas». Si el conjunto cargado es parcial, informar esa cobertura sin inventar un total. Un servicio con solo origen puede tener un punto válido y mostrar «Destino sin coordenadas».

**Eliminar:** otro botón Sin asignar con estado independiente del filtro existente y filtrado geográfico automático por mover el mapa. «Buscar en esta zona» puede añadirse después si hace falta.

**Aceptación:** los mismos servicios están disponibles desde la lista aunque no se puedan dibujar. Una búsqueda por patente, código, chofer o móvil funciona igual en ambas vistas. Validar la carga limitada antes de afirmar «todos los servicios».

## 3. Orden de lectura y cola de trabajo

**Mantener:** orden de resultados de la lista actual al cambiar de presentación. No introducir una ordenación distinta exclusiva del mapa.

**Mejorar:** dentro del detalle, sección «Cola del chofer» que use el orden operativo existente cuando aplique. Mostrar móvil por servicio si cambia. Separar «En curso», «Siguiente» y «Programado» solo cuando los datos actuales permiten afirmarlo. Si no existe cola aplicable, usar «Otros servicios asignados» sin prometer cuál es el siguiente.

**Eliminar:** ordenar la cola por horario en lugar de `driver_queue_position`, llamar a toda lista «cadena del móvil», o reordenar automáticamente por cercanía. La V1 consulta la cola; para modificarla se accede al control existente.

**Aceptación:** si el servicio de las 15:30 es primero en la cola y el de las 15:00 es segundo, el mapa refleja ese orden y mantiene ambos horarios visibles. El fin del trabajo del chofer y el cierre administrativo no se tratan como el mismo evento.

## 4. Mostrar puntos y líneas

**Mantener:** origen A, destino B, identificación del servicio y móvil, flechas discretas y ruta seleccionada en ámbar.

**Mejorar:** para el mapa operativo, recorrido origen → destino. Base/retorno se consultan en el visor de facturación existente. Un servicio en un solo lugar muestra un punto, no un viaje inventado. La ruta completa guardada solo se reutiliza si corresponde a esos extremos y al modo correcto, o si se puede extraer y validar el tramo pertinente.

Mostrar como contexto las rutas válidas ya disponibles; obtener la ruta del seleccionado bajo demanda. Con muchos puntos, agrupar y reducir etiquetas; concentrar las líneas en selección y contexto relevante. No hacer una consulta nueva de rutas por cada servicio al entrar o por cada refresco de estados. Mantener las líneas pedidas por el usuario sin convertirlas en una red ilegible.

**Eliminar:** unión directa ficticia cuando falta geometría, rutas animadas, color distinto para cada servicio y mezcla automática de recorrido comercial con ruta operativa.

**Aceptación:** una ruta Base → Origen → Destino → Base no se etiqueta como Origen → Destino. Si falla el trazado, siguen los puntos y las acciones. Al editar una dirección, invalidar el trazado anterior; una respuesta atrasada no restaura la ruta vieja. La ruta de automóvil es una referencia y no una garantía de accesibilidad para toda grúa.

## 5. Seleccionar y consultar detalle

**Mantener:** una sola selección compartida entre fila, puntos, línea e inspector.

**Mejorar:** orden del detalle: identificación/estado → responsable → horarios → origen/destino → situación documental relevante → cola. Abrir servicio conserva el contexto al regresar. El mapa tiene suficiente ancho; en notebook, lista y detalle alternan dentro de una misma columna lateral. Seleccionar resalta sin forzar siempre zoom; ofrecer «Ver recorrido» si el servicio quedó fuera del encuadre.

**Eliminar:** repetir tarjetas completas en lista y detalle; permitir varios inspectores abiertos; hacer zoom por cada actualización.

**Aceptación:** con dirección larga, error de ruta o cola extensa, las acciones permanecen visibles. Se puede cerrar y volver al punto de origen con teclado.

## 6. Horarios y avisos

**Mantener:** fecha/hora del servicio, arribo y fin, cada uno con su significado.

**Mejorar:** usar la denominación de negocio verificada para `scheduled_for`. Hasta confirmarla, «Fecha/hora del servicio»; no afirmar que siempre sea un compromiso de llegada. Una hora de arribo real solo viene de un registro real. Si se presenta una hora estimada o cargada manualmente, identificarla como tal. En servicios de días distintos, incluir fecha, no únicamente hora. Usar horario de Argentina como en Servicios.

**Eliminar:** contador «demorado» calculado como ahora menos `scheduled_for`, ETA tomado de la duración de una ruta o sustitución silenciosa de hora real por estimada.

**Aceptación:** horario de servicio 14:30, arribo real 14:42 y fin 15:10 se leen como tres datos distintos. Si falta el arribo real, no completar 14:42 con una estimación sin etiqueta.

## 7. Asignar o reasignar

**Mantener:** abrir el flujo existente con sus comprobaciones y confirmación. Móvil y chofer no forman una pareja fija elegida por el prototipo.

**Mejorar:** máximo una acción principal contextual, «Abrir servicio» y menú secundario. La lista de acciones proviene de `quickActions` y de permisos, no de una tabla de estados duplicada en el mapa. Un remito firmado, un activado o una logística tercerizada cambian las acciones posibles. Comprobar el estado vigente al guardar y presentar el motivo si el recurso no resulta asignable.

Si se asigna desde el filtro Sin asignar, actualizar los resultados y explicar: «Asignado al móvil X; ya no coincide con Sin asignar». Mantener un resumen de confirmación con Cerrar/Ver servicio o un aviso con enlace. No dejar un inspector que parezca pertenecer al resultado actual sin explicación, ni quitar el filtro automáticamente.

**Eliminar:** recomendación de recurso sin datos de ubicación/disponibilidad, controles arrastrables para asignar y reasignación directa sin contexto.

**Aceptación:** cancelación o error no alteran lista ni mapa. Si otro operador cambia el servicio, mostrar el resultado vigente. La selección de un recorrido nunca asigna nada.

## 8. Registrar y recibir el arribo

**Mantener:** el evento real del chofer y el arribo manual permitido, con su motivo y auditoría.

**Mejorar:** actualizar la etiqueta Arribado y la hora disponible, resaltando una vez el cambio. La firma y la revisión documental se muestran por separado: «Arribado» no garantiza «Remito firmado/aprobado». Releer las acciones vigentes después del evento; no dejar Reasignar habilitado solo porque estaba antes.

**Eliminar:** botón de simulación en producto, llegada deducida por proximidad al pin o mover un ícono de camión al origen al marcar arribo. No marcar media ruta como recorrida: no se conoce el progreso físico.

**Aceptación:** el cambio puede llegar mientras el operador inspecciona otro servicio sin interrumpirlo. El arribo manual conserva el motivo y no agrega una captura GPS inexistente.

## 9. Terminar trabajo, revisar remito y finalizar

**Mantener:** usar el cierre actual, con revisión de diferencias, excepciones, hora de finalización y circuito de Facturación.

**Mejorar:** distinguir trabajo terminado para el chofer de cierre administrativo. `driverDone` puede sacar un trabajo de su cola mientras Operaciones todavía debe revisar el remito. No recrear una ocupación del móvil a partir de que el servicio siga visible en Activos.

Al confirmar el cierre y recargar, la clasificación usa `activeServices`/`historyServices`. Si ya corresponde a Historial, retirar línea y fila de Activos, mostrar confirmación con «Ver en Historial» y conservar cámara y filtros. No navegar automáticamente a Historial ni abrir el siguiente servicio sin una acción del operador.

Si persiste una revisión documental, mantener su presencia según la regla canónica y mostrar «Pendiente de revisión». Un error de cierre conserva el servicio y explica qué falta. Los caminos existentes de cierre sin arribo, sin remito o de tercero siguen disponibles cuando corresponden.

**Eliminar:** regla simplificada «completed siempre desaparece», finalización con una mutación local y deducción «móvil libre» después de cerrar.

**Aceptación:** verificar por separado remito firmado sin diferencias, con diferencias, excepción documental, cierre sin arribo y tercero. Ninguno puede saltear validaciones por entrar desde el mapa.

## 10. Historial

**Mantener:** consulta de servicio cerrado, responsable, horas, remito e historial de eventos; anulados según configuración existente.

**Mejorar:** usar período y alcance explícitos. Conservar el criterio de fecha que usa Historial hoy; «Ver en Historial» debe localizar por ID aunque la fecha del servicio sea distinta de la fecha de cierre. Registrar los filtros anteriores para poder volver. Mantener la paginación/cobertura coherente con Lista; no afirmar que el mapa contiene más registros de los realmente cargados.

Las líneas históricas representan el recorrido guardado del servicio, no un rastro GPS. Si hay que recalcular por falta de geometría, identificarlo como «Ruta calculada ahora». La edición administrativa existente se permite solo bajo sus reglas; el mapa no agrega un cierre ni una reapertura propia.

**Eliminar:** mapa global de todo el historial al entrar, permisos nuevos de edición y rutas reconstruidas presentadas como evidencia de lo que efectivamente ocurrió.

**Aceptación:** encontrar un servicio de ayer cerrado hoy, consultar un anulado y volver a Activos sin perder contexto.

## 11. Casos que la demo no cubría

- **Una sola dirección:** un punto y el tipo de asistencia; no duplicar A/B en el mismo lugar como si hubiera traslado.
- **Tercerizado:** proveedor externo en lugar de inventar chofer/móvil propio; sus acciones vigentes.
- **Activado:** estado/categoría actual y recorrido solo si corresponde. Movida con km manuales no tiene una geometría demostrada.
- **Anulado:** no compite con trabajos activos; disponible en Historial si la configuración lo permite, sin presentación de tarea pendiente.
- **Ingreso del chofer sin vincular:** sigue en su bandeja actual; no fabricar otro servicio con otro ID en el mapa.
- **Coordenadas incompletas o antiguas:** mantener listado y explicar qué falta; no geocodificar textos ambiguos masivamente en segundo plano.
- **Sin permisos para operar:** consulta permitida sin acciones de escritura. El mapa usa el mismo alcance por organización/rol.

Estos casos son compatibilidad mínima, no módulos nuevos.

## 12. Ubicaciones y GPS

**Recomendación de recorte:** sacar de la V1 el marcador del teléfono, la sección de última ubicación, precisión, antigüedad y captura de permisos mientras no haya una fuente real integrada. No llenar todos los inspectores con un panel vacío.

Conservar el espacio conceptual para una evolución. Si se decide incluir una fuente puntual real, tratarla como alcance adicional, validando identidad, jornada, unidad y hora antes de mostrarla. Un evento «arribó» puede aparecer en el historial del servicio, pero no equivale a posición medida del dispositivo.

La fase GPS de la deuda #11 es independiente de este mapa. La V1 puede salir sin app nativa, integración de GPS ni nuevas tablas de ubicación.

## 13. Actualización, errores y costos

**Mantener:** recarga tras guardar, actualización manual y mecanismo periódico de Servicios. La V1 informa actualización de datos operativos, no seguimiento en vivo.

**Mejorar:** actualizar solo datos y capas afectados. No recargar el SDK ni recalcular rutas cuando cambia únicamente un estado o un remito. Descartar respuestas viejas al cambiar servicio/dirección, limitar consultas simultáneas y liberar listeners al salir. Con error del proveedor, mantener lista/detalle y permitir reintento acotado.

**Eliminar:** canal realtime nuevo como requisito inicial, reintentos infinitos y llamada de rutas por cada muestra o refresco. Reusar geometría solo cuando su correspondencia y las condiciones del proveedor lo permitan.

**Aceptación:** perder conexión, reconectar, abrir/cerrar mapa varias veces y recibir cambios durante un formulario no pierden trabajo ni duplican llamadas indefinidamente. Revisar cuotas, credenciales y coordenadas visibles por rol antes de activar rutas en producción.

## 14. Celular, accesibilidad y motion

**Mantener:** mapa arriba y detalle abajo; acciones fijas, lectura por texto/forma además de color, controles táctiles de al menos 44 px y alternativa Lista.

**Simplificar:** dos niveles del panel: resumen y detalle expandido, ambos accesibles por botón. Posponer un sistema propio de arrastre con tres alturas y resortes. En notebook, preferir una columna lateral alternable antes de comprimir mapa, lista e inspector simultáneamente.

**Motion necesario:** indicador Lista/Mapa, apertura/cierre de detalle y énfasis breve tras cambio confirmado. Con movimiento reducido, conservar toda la información sin desplazamientos. Actualizaciones no roban foco, no reordenan debajo del puntero ni mueven cámara.

**Eliminar:** animación de vehículos, pulsos permanentes, múltiples acciones ámbar, tarjetas repetidas y subtítulos/botones de la grabación dentro del producto final.

**Aceptación:** direcciones y códigos largos, zoom de texto, teclado, panel expandido, modo claro/oscuro y error de mapa mantienen una salida visible y acciones utilizables.

## Recortes recomendados

| Sacar de la primera entrega | Mantener |
|---|---|
| Ubicación del teléfono y panel vacío de último reporte | Ubicación del servicio y su responsable |
| ETA, tránsito y recomendación/asignación automática | Horarios existentes correctamente identificados |
| Ordenamiento de cola por cercanía o por hora en el mapa | Cola operativa del chofer, en consulta |
| Otro filtro Sin asignar y otra lógica de permisos/estados | Filtros y flujos actuales compartidos |
| Consulta masiva de todas las rutas al abrir | Ruta seleccionada bajo demanda y geometría válida disponible |
| Conectar cada servicio con el siguiente como si fuera un viaje confirmado | Recorridos individuales y orden de cola cuando existe |
| Animación de marcha y panel móvil de tres alturas con arrastre propio | Selección clara y panel de dos niveles |
| Dashboard de métricas, optimización y nuevo módulo de despacho | Vista Mapa dentro de Servicios |

## Orden de construcción propuesto

1. **Contrato de datos y estados:** validar coordenadas por rol, geometría, cobertura/paginación, semántica de horarios, cola y clasificación documental. Comprobar qué se obtiene con las consultas existentes antes de proponer cambios de base.
2. **Lectura funcional:** selector Lista/Mapa, filtros, puntos, selección y detalle. Casos sin coordenadas, una dirección y terceros desde el inicio.
3. **Recorridos:** origen/destino correctos, reutilización validada, carga bajo demanda, errores y control de consumo.
4. **Operación:** conectar formularios y acciones actuales; actualizar arribo, asignación, revisión y cierre sin perder contexto.
5. **Historial y casos límite:** revisión pendiente, anulado, activado, cierre en otra fecha, permisos y cambios concurrentes.
6. **Adaptación y prueba:** escritorio/notebook/celular, accesibilidad y motion; piloto con operadores antes de ampliar funcionalidades.

No exige rehacer toda la pantalla ni agregar seguimiento. La salida de esta revisión es un plan corregido, no la implementación ni una nueva autorización de despliegue.
