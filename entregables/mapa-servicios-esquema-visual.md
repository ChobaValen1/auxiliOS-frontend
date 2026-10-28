# Servicios · Propuesta visual de mapa

28/10/2026 · Diseño y demo aprobados por el usuario como base de la V1; integración en AuxiliOS pendiente. Datos de los conceptos: simulados.

**Revisión funcional posterior:** [revisión proceso por proceso de la V1](mapa-servicios-revision-v1.md). Precisa cola del chofer, revisión documental, rutas operativas y recortes recomendados. Este archivo conserva el concepto aprobado; las simplificaciones posteriores están identificadas como propuestas en la revisión.

## Aprobación y alcance de V1

El usuario aprobó la demo de escritorio y celular: «Sí, me gusta. Como versión inicial está perfecto».

La primera versión contempla Lista/Mapa dentro de Servicios, filtros compartidos, recorridos previstos, móvil y chofer asignados, horarios, detalle contextual y acciones que reutilicen los flujos actuales. El arribo actualiza estado y hora. Al cerrar, la ubicación en Activos/Historial respeta también la situación documental: puede quedar revisión pendiente. El cierre mantiene las validaciones vigentes y no presupone que el móvil quede libre.

Las ubicaciones puntuales solo se muestran si hay una fuente real, con fecha, hora y precisión cuando corresponda; en otro caso, se informa su ausencia. La captura ficticia de la demo no es una integración aprobada ni implementada. Seguimiento continuo, ETA y recomendación/asignación automática permanecen como evolución posterior en la deuda #11.

Esta aprobación corresponde al diseño y comportamiento inicial; no registra un despliegue ni una integración completada.

## Decisión que debe facilitar

Identificar dónde se realiza cada servicio, qué recurso tiene asignado, para cuándo está pactado y qué acción necesita Operaciones. El mapa es una vista de Servicios → Activos, con selector Lista/Mapa y filtros compartidos.

## Escritorio

Barra de aplicación existente → título y Nuevo servicio → Activos/Historial y Lista/Mapa → búsqueda/filtros → área operativa.

Área operativa: cola de servicios (~280 px), mapa dominante flexible y detalle del servicio seleccionado (~300 px). En anchos intermedios se alterna cola/detalle en una sola columna lateral para preservar mapa útil. Sin selección se muestra cola y mapa; la selección agrega el inspector si hay espacio. No seleccionar automáticamente un servicio arbitrario al entrar.

- Cola: número, estado, horario pactado, móvil y chofer, origen/destino abreviados. Orden predeterminado por horario pactado; filtro explícito «Sin asignar». Una actualización no reordena filas bajo el puntero; ofrecer indicador de nuevos resultados.
- Mapa: calles y barrios como contexto, orígenes/destinos, rutas previstas y reportes puntuales válidos. Se prioriza la ruta seleccionada, con las demás atenuadas. Mostrar rutas del resultado filtrado y reducir detalle por zoom; agrupar puntos superpuestos y permitir su selección individual.
- Inspector del concepto: número/tipo/estado; móvil y chofer; horario; origen/destino; último reporte; cadena; acciones. La revisión recomienda usar «Cola del chofer» y el orden operativo existente, verificar el significado del horario y posponer el último reporte hasta tener una fuente real.
- Mantener horario pactado distinto de hora de arribo real. Sin motor de ETA validado no mostrar minutos de llegada ni alertas de demora inferidas.

## Semántica cartográfica

| Elemento | Representación | Regla |
|---|---|---|
| Servicio seleccionado | Ruta ámbar, etiqueta número/móvil | Selección sincronizada entre lista, mapa y detalle |
| Otros servicios | Rutas azul grisáceo y menos etiquetas | No un color distinto por servicio |
| Origen/destino | A circular / B con forma de pin | Letras y forma, además de color |
| Sentido | Flechas discretas en recorrido | No animación continua de flujo |
| Último reporte del dispositivo | Marcador cuadrado con móvil y hora | Solo si hay captura real asociada a jornada y unidad |
| Ubicación desactualizada | Contorno atenuado + texto con antigüedad | No confundir antigüedad con disponibilidad operativa |
| Sin ubicación capturada | Texto «Sin ubicación reportada» | No colocar la unidad artificialmente en el origen |

Una marca de arribo manual puede mostrar «Arribo informado en origen, 13:52», pero no prueba la posición medida del teléfono. El marcador GPS necesita una muestra real y su precisión. No deducir ubicación actual del servicio asignado o del estado Arribado.

Las líneas son rutas previstas por calles, no trazas recorridas ni kilómetros facturables. Si falta geometría de ruta, mostrar extremos y «Ruta no disponible»; no inventar un trazado. Tamaños de marcador y etiquetas permanecen legibles al ampliar. Proveedor, atribución, cuotas y condiciones se revisan antes de implementar, evaluando la integración existente con Google Maps.

En la primera entrega, la captura de ubicaciones puntuales sería un alcance adicional: los campos de origen/destino existentes no constituyen un historial de posición del chofer. Hasta contar con fuente real, mostrar su ausencia; los ejemplos de reportes del concepto son ilustrativos.

## Celular

Encabezado compacto y filtros resumidos; mapa visible primero; detalle en panel inferior con posiciones compacta, media y expandida. Botones para expandir/cerrar además de arrastre. En detalle expandido se puede consultar la cadena sin mantener todo superpuesto al mapa. Alternativa Lista siempre disponible.

Etiquetas mínimas en mapa, selección por toque, controles de zoom visibles y anterior/siguiente servicio. Acciones con blancos táctiles de al menos 44 px. En paisaje, reducir encabezado y evaluar detalle lateral según ancho. Teclado de búsqueda no debe tapar resultados ni acciones.

## Motion funcional propuesto

| Cambio | Movimiento | Duración orientativa |
|---|---|---|
| Lista ↔ Mapa | Indicador segmentado se desliza; contenido se desvanece | 160–200 ms |
| Selección de servicio | Borde y énfasis de ruta cambian juntos | 120–180 ms |
| Apertura de detalle | Desplazamiento corto + opacidad; resorte amortiguado en panel móvil | 200–260 ms |
| Cambio confirmado | Resaltado discreto de una sola vez | 500–700 ms |
| Actualización pendiente | Indicador estable «Actualizando» | Sin pulsos decorativos |

No animar desplazamientos de unidades sin muestras reales, ni hacer zoom ante cada evento. «Ver recorrido» encuadra por pedido del usuario. Respetar `prefers-reduced-motion` con cambios inmediatos o fundidos breves. Preservar foco, selección, filtros y posición del mapa al recibir datos.

## Jerarquía y decisiones de UX

- Contraste y tamaño para prioridad; proximidad para agrupar horario/recurso/recorrido. Ámbar reservado a selección y acción principal; advertencias con ícono y texto para no competir por color.
- Mostrar primero contexto y después acciones: seleccionar no modifica datos. El cierre del inspector devuelve foco a su origen.
- «Abrir servicio» navega sin modificar; «Asignar/Reasignar» abre el flujo existente, muestra contexto y confirma el cambio al guardar. Anular va al menú secundario y requiere motivo/confirmación según las reglas vigentes.
- Etiquetas persistentes para horarios, fuente de ubicación y estado. No esconder información esencial en hover. Lista equivalente y navegación por teclado para no depender de la percepción del mapa.
- Al cambiar Lista/Mapa conservar filtros; en navegación conservar selección válida. Si un servicio sale del filtro tras un cambio, informar qué pasó, sin reemplazarlo silenciosamente por otro.
- Carga, sin resultados, coordenadas faltantes, falta de ruta, mapa no disponible y conexión interrumpida tienen estados propios. Con error de mapa, lista y acciones siguen disponibles; con datos antiguos, mostrar hora de actualización y no aparentar continuidad en vivo.

## Revisión antes de implementación

Los conceptos y la demo ya fueron aprobados. Continuar con la revisión funcional vinculada al inicio: contrato de datos, cola, clasificación documental, costos de rutas, estados, accesibilidad y pruebas de interacción. No incorpora seguimiento continuo ni asignación automática.
