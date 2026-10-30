# Deudas pendientes (anotadas por el dueño)

Lista de mejoras para ir viendo con el tiempo. Se agregan abajo a medida que aparecen.

| # | Tema | Anotado | Estado |
|---|------|---------|--------|
| 1 | Servicios programados para los choferes | 14/10/2026 | Hecho · en producción (v490) |
| 2 | Tema de pantalla: Blanco / Negro / Sistema | 14/10/2026 | Hecho · en producción (v485) |
| 3 | Editar servicios finalizados (operadores) | 14/10/2026 | Hecho · en producción (v468) |
| 4 | Tarifas que dependen del servicio principal | 14/10/2026 | Hecho · en producción (v463) |
| 5 | Chofer con más de un servicio en curso a la vez | 14/10/2026 | Hecho · encendido para todos |
| 6 | Servicios activados: siempre facturables, Activado Origen / Activado Movida | 15/10/2026 | Hecho · en producción (v464) |
| 7 | Peajes pagados por el socio: un medio de pago para todos | 15/10/2026 | Hecho · en producción (v469) |
| 8 | Paleta sobria (como en Remitos) en Servicios y Facturación | — | Hecho · en producción |

## Pendientes de la planilla «Lista de tareas AuxiliOS» (Google Sheets, revisada el 20/10/2026)
La planilla tiene 20 tareas: 12 marcadas como hechas y 8 abiertas. Estas son las abiertas:

| # | Tarea | Urgencia | Plazo | Estado |
|---|-------|----------|-------|--------|
| P1 | Reglas para remitos sin ingreso: hoy solo deja crear el servicio, pero a veces ya estaba creado | ALTA | Corto | Hecho · en producción (v508): se puede vincular también a un servicio Sin asignar, y Operaciones puede anular el ingreso |
| P2 | Que el chofer pueda anular un servicio sin ingreso | ALTA | Corto | Hecho · en producción (v508): «Anular este ingreso» con motivo, mientras Operaciones no lo vinculó |
| P3 | Formato de cobro «A definir»: se marca el peaje y el chofer completa el medio de pago | ALTA | Corto | Hecho · en producción (v515): Cobro al cliente único (medio principal + segundo medio) en el operador («A definir»), en el remito del chofer y en la corrección después de la firma; «Aprobar» toma importe, cantidad y medio del chofer |
| P4 | Panel: quitar datos innecesarios o repetidos y dejar los importantes (km, etc.) | ALTA | Corto/Mediano | Parcial · Panel rediseñado; falta revisar qué datos sobran |
| P5 | Mejorar la UI del Panel | MEDIANA | Corto | Hecho · Panel nuevo con zoom y Operaciones rediseñado (falta tildarlo en la planilla) |
| P6 | Mapa para operadores: todos los servicios, dónde empiezan y terminan, y qué móvil tienen | MEDIANA | Mediano | V1 implementada en v586 (28/10/2026) · [alcance y validación](mapa-servicios-v1-implementacion.md) · GPS/ETA siguen en #11 |
| P7 | La edición de peajes con el mismo formato que el alta | BAJA | Corto | A confirmar · los peajes del servicio ya usan una sola tabla (Quién paga, Peaje, Importe, Cantidad) |
| P8 | Chat interno y grupos por rol (notas sobre servicios, turnos, información) | BAJA | Mediano | Pendiente |

## 1) Servicios programados para los choferes
Poder dejar servicios programados para un chofer, como una fila o cola de servicios que el chofer va viendo y tomando en orden. Se piensa junto con la 5.

## 1) Avance (18/10/2026)
En prueba (v490). Elegido por el dueño: **B, sin bloquear**.
- En «Servicios» del chofer, los servicios para dentro de más de 2 horas van aparte, abajo, en **Programados**, ordenados por fecha, con «Mañana 08:00» y cuánto falta.
- Se pueden empezar antes: al abrirlo aparece «Empezar ahora» y se pide confirmar («¿Empezás este servicio ahora?»), porque a veces el horario pactado se adelanta.
- Con la cola de varios servicios, un programado no frena a los de ahora.

## 2) Tema de pantalla
Un operador dijo que el fondo negro le molesta. Cada usuario tiene que poder elegir **Blanco**, **Negro** o **Sistema** (el que use el celular o la computadora).

## 2) Avance (18/10/2026)
En prueba (v485). Cada usuario elige **Oscuro**, **Claro** o **Sistema** con el botón de ícono (luna, sol o pantalla) al lado del perfil, arriba a la derecha, en la computadora; en el teléfono, en Configuración › Tema (el chofer, en su cuenta). También en Mi cuenta. Se guarda en ese navegador para ese usuario. Sistema sigue el modo del celular o la computadora y cambia solo.

## 3) Editar servicios finalizados (operadores)
Los operadores tienen que poder editar un servicio ya finalizado. El cambio se tiene que ver bien en el **Historial** y también en los datos de **Facturación**.

## 4) Tarifas que dependen del servicio principal (importante)
Algunos conceptos no tienen precio propio: toman el precio de un valor del servicio principal.

Ejemplo:

| Servicio principal | Movida | Km asfalto | Km ripio | Hora de Espera | Doble Cabina |
|---|---|---|---|---|---|
| Liviano | $1000 | $20 | $25 | = Movida → **$1000** | = Km → **$20** |
| Semipesado | $1300 | $28 | $32 | = Movida → **$1300** | = Km → **$28** |

- **Hora de Espera** cobra lo mismo que la **Movida** del servicio principal.
- **Doble Cabina** cobra lo mismo que el **Km** del servicio principal.
- Si cambia el precio del principal, el concepto que depende de él tiene que cambiar solo.
- Falta definir: en Doble Cabina, ¿toma el km de asfalto, el de ripio o el que corresponda a cada tramo?

## 5) Chofer con más de un servicio en curso a la vez
**Hoy:** el chofer no puede cargar ni hacer otro servicio hasta finalizar el que tiene en curso.
- La app no lo deja empezar un remito nuevo si tiene un servicio asignado sin terminar.
- La base tampoco acepta dos viajes del mismo chofer con horarios que se pisan.

**Lo que pasa en la calle:** a veces, con un servicio en curso, el chofer hace otro.

**Ya definido (14/10/2026):**
- Ejemplos: lleva un auto y en el camino levanta otro, o hace una UML mientras tiene otro servicio en curso.
- Puede tener **varios** servicios en curso a la vez, sin un máximo fijo.
- Cada servicio se factura con **sus propios km**, aunque compartan parte del camino.
- Los servicios en cola los toma **en orden**.
- El servicio en camino lo puede habilitar **cualquiera de los dos**: el operador asignándoselo, o el chofer empezándolo solo.
- Sueldos con "KM reales": se pagan los **km de la jornada** (lo que anduvo el camión), no la suma de los servicios.

**Propuesta:**
- **Cola del chofer:** el operador asigna varios servicios a un chofer y los ordena. El chofer los ve como "Mis servicios", en ese orden.
- **Sumar en camino:** con un servicio en curso, el chofer puede empezar el siguiente de la cola, o uno nuevo sin asignar, sin cerrar el anterior. Cada uno tiene su remito y su firma.
- **Km:** cada servicio guarda sus propios km para facturar. Los km del camión y de la jornada salen del odómetro de la jornada, así no se cuentan dos veces.
- **Base:** se quita la traba que impide dos viajes del mismo chofer con horarios que se pisan.

**Plan por etapas (14/10/2026):**
0. Preparación: crear un chofer y un móvil de prueba (se borraron los anteriores).
1. Base de datos: asignar a un chofer ocupado deja el servicio en su cola; cada servicio guarda su lugar en la cola; se quitan las trabas "chofer ocupado", "viaje en curso" y la de viajes que se pisan.
2. Operador: en Servicios se ve "En cola · 3º" y se puede subir o bajar el orden.
3. Chofer: "Mis servicios" en orden; solo empieza el siguiente; con uno en curso puede empezar el siguiente o agregar uno en el camino.
4. Km, Facturación, Sueldos y cierre de jornada: cada servicio con sus km; "KM reales" siguen saliendo de la jornada; al cerrar la jornada avisa qué servicios faltan.
5. Prueba completa con el chofer de prueba y pase a producción cuando se apruebe.

- Cierre de jornada (definido 14/10/2026): **no deja cerrarla** si hay servicios sin terminar y muestra cuáles faltan.

**Avance:**
- Etapa 1 (base) hecha el 14/10/2026. Todo queda detrás de un interruptor por chofer (`multi_service_v1`), **apagado para todos**: los choferes reales siguen igual que antes. Probado en la base sin guardar datos: 3 servicios a la vez, orden de la cola, traba de orden y mover en la cola.
- Etapa 2 (operador) hecha el 14/10/2026: en Servicios se ve "En curso · 1º de 4" / "En cola · 3º · siguiente", "N servicios" en Chofer, flechas para subir o bajar, y asignar a un chofer ocupado avisa en qué lugar quedó. Solo aparece para choferes con el interruptor.
- Etapa 3 (chofer) hecha el 14/10/2026: "Mis servicios" numerados en orden (En curso / Siguiente / En cola), aviso "Tenés N en curso y M en cola", botón "Empezar este servicio" solo en el siguiente, los de más abajo se habilitan en orden, y "+ Servicio en el camino" funciona con otro en curso. Solo para choferes con el interruptor.
- Etapa 4 hecha el 14/10/2026: al cerrar la jornada, si quedan servicios sin terminar, no la deja cerrar y muestra la lista ("No podés cerrar la jornada"). Sin señal usa la última lista guardada en el teléfono. Facturación ya cobra cada servicio con sus propios km y Sueldos con "KM reales" sigue usando los km de la jornada: no hizo falta cambiarlos. Solo para choferes con el interruptor.
- La traba de viajes que se pisan ya se cambió (etapa 1): no aplica a los choferes con el interruptor.
- Etapa 5 hecha el 14/10/2026: probado con el Chofer de Prueba y encendido para todos los choferes. Es la regla por defecto, también para los choferes nuevos. Para apagárselo a uno se guarda `enabled=false` en `user_feature_flags` (`multi_service_v1`).

## 4) Avance (15/10/2026)
Hecho y en producción (v463). En Tarifas, cada adicional puede tomar su precio de la Movida o del Km asfalto del servicio principal. Doble Cabina usa el Km de asfalto. Se dieron de baja "Hora de Espera LIVIANO" y "SEMIPESADO": queda una sola "Hora de Trabajo / Espera".

## 6) Servicios activados
- Un servicio activado **siempre es facturable**. Si no se factura, no es un activado: es un anulado.
- Cuando se marca como activado, se elige el tipo:
  - **Activado Origen:** el móvil llegó al origen. Los km se calculan como **Base → Origen → Base**, y **cambian los km del servicio**.
  - **Activado Movida:** todavía no llegó al origen, pero estaba en camino. Se cargan **a mano** los km que hizo.
- **Hecho (v464, 15/10/2026):** se elige Origen o Movida al finalizar el activado (desde Operaciones y desde el ingreso del chofer). Ya no existe "No facturable". Origen calcula los km con el mapa y se pueden corregir; el precio se recalcula con esos km.

## 7) Peajes pagados por el socio (operador)
- Cuando los peajes los paga el socio, **no** se pide el medio de pago en cada peaje.
- Se elige **un medio de pago principal** para todos.
- Si el cliente paga una parte con otro medio, se habilita cargar ese otro medio para esa parte.

## Otras deudas anotadas
| # | Tema | Anotado | Estado |
|---|------|---------|--------|
| 9 | Animación del botón «Continuar» → puntos de carga → tilde (shot «cred-button-loading-to-tick-animation» de 60fps, con su timing, easing y springs sin cambios). Referencia de navegación: Floating Pill Nav de Framer | 20/10/2026 | Pendiente · requiere conectar el MCP de 60fps (https://60fps.design/mcp) |
| 10 | Mapa con varias ubicaciones (referencia: componente Framer «MultiLocationMap», https://framer.com/m/MultiLocationMap-yASI.js@AUuYrFO2fInwLOl2DOxV). Se puede usar para el mapa de operadores (P6) | 20/10/2026 | Pendiente |
| 11 | Seguimiento de teléfonos durante la jornada: mapa en vivo de choferes y unidades, cadena de servicios, recomendación de asignación y distancia/ETA por ruta. Amplía P6 y #10; ver [plan por etapas](ubicacion-flota-plan.md) | 28/10/2026 | Pendiente · análisis registrado; sin implementar |

## Referencias de UI para aplicar (21/10/2026)
Se hacen a mano (sin librerías nuevas), con la estética oscura y ámbar y respetando «menos movimiento». Una por vez, en prueba y con OK antes de producción.

| # | Referencia | Dónde en AuxiliOS | Estado |
|---|-----------|-------------------|--------|
| U1 | hover.dev · Stacked notifications (https://www.hover.dev/components/notifications#stacked-notifications) | Todos los avisos (guardado, errores, «Servicio finalizado»): apilados, con resorte, se cierran deslizando | Hecho por el equipo · capa Motion (avisos apilados, cola de 3, errores fijos) |
| U2 | hover.dev · Spring modal (https://www.hover.dev/components/modals#spring-modal) | Confirmaciones: anular ingreso, guardar y finalizar, dar de baja, rechazar con motivo | Hecho por el equipo · capa Motion (modales con resorte) |
| U3 | hover.dev · Morph stepped progress (https://www.hover.dev/components/progress#morph-stepped-progress) | Pasos del remito del chofer y asistentes por pasos | Hecho por el equipo · capa Motion en el remito del chofer (pasos con tilde y barra) |
| U4 | hover.dev · Shuffle sort table (https://www.hover.dev/components/tables#shuffle-sort-table) | Ordenar columnas en Servicios, Facturación y Sueldos: las filas se reacomodan animadas | Pendiente |
| U5 | hover.dev · Fancy dark mode toggle (https://www.hover.dev/components/toggles#fancy-dark-mode-toggle) | Botón de tema (Oscuro / Claro / Sistema) | Hecho por el equipo · capa Motion (revelado circular al cambiar el tema) |
| U6 | Framer · Floating Pill Navigation (https://framer.com/m/FloatingPillNavigation-s92k8M.js@qwsogf78G8HhJg4I53jE) | Navegación del celular (barra inferior flotante); va con la #9 | Hecho por el equipo · capa Motion (navegación flotante del celular) |
| U7 | Framer · Dynamic Island Nav (https://framer.com/m/DynamicIslandNav-hskTZL.js@alczdDjobHIsFEUpStTB) | Chofer: píldora arriba con el servicio en curso y el estado de sincronización, que se expande al tocarla | Pendiente |
| U8 | Framer · Scroll Reveal Button (https://framer.com/m/Scroll-Reveal-Button-snz7.js@JmhMNWep29NgFxT5j7B0) | Botón flotante «Nuevo servicio» / «Nuevo remito» que se achica al bajar y se agranda al subir | Pendiente |
| U9 | Framer · WhatsApp Chat (https://framer.com/m/WhatsAppChat-fyWs.js@q1lP6khd8m6Fr35C9HJU) | Chat interno y grupos por rol (P8) | Pendiente |
| U10 | Framer · Comparison Table (https://framer.com/m/Comparison-Table-TFFKi3.js@ovtvDlm0fw6HBKwxAywM) | Revisión del remito: planificado vs. informado por el chofer, lado a lado | En prueba (v589): tarjeta por peaje/excedente con «En el servicio» | «Informó el chofer», diferencias en ámbar y cuánto cambia el total |
| U11 | Framer · Loader Counter (https://framer.com/m/LoaderCounter-yRE5.js@1KnRwfjCWO0zsTVvk5Tx) | Pantalla de carga al abrir la app y números del Panel que cuentan al aparecer | En prueba (v592): ui/count-v1 hace contar los números de las tarjetas del Panel (la pantalla de carga queda pendiente) |
| U12 | Captura «Workspace» (dashboard con tarjetas + mini gráficos, puntos guía y «Take the tour») | Panel: tarjetas con mini gráfico y variación vs. mes anterior; recorrido guiado con puntos para usuarios nuevos | Parcial · el equipo hizo el inicio de administración con comparaciones del día y rankings; falta el recorrido guiado |
| U13 | Framer · Bordered Tooltip (https://framer.com/m/Bordered-Tooltip-zvyCPD.js@CU8d8e1RdeSolPazgavR) | Ayudas al pasar el mouse en toda la app: botones con ícono, gráficos del Panel, «Formato de cobro» | En prueba (v590): ui/tooltip-v1 reemplaza todos los «title» por un globo con borde ámbar |
| U14 | Framer · Project Hours Chart (https://framer.com/m/ProjectHoursChart-stiK.js@0fVxESrZLHegcD1x5LPf) | Jornadas y Sueldos: horas trabajadas por chofer y por día (y horas de motor por camión) | Pendiente |
| U15 | Framer · Interactive Insight Donut (https://framer.com/m/InteractiveInsightDonut-1-Q6YAFK.js@UBw7HqJtwj4jgJTvTZEI) | Panel: servicios por prestadora y cobros por medio (efectivo, transferencia…), tocando cada parte para ver el detalle | Pendiente |
| U16 | Framer · Price Target Fan (https://framer.com/m/PriceTargetFan-XsmEf0.js@QYG26zl5t7pkS3XfufPH) | Panel / Facturación: proyección de lo facturado en el mes (rango esperado según lo que va del mes) | Pendiente |
| U17 | Framer Marketplace · CSV Data Pro (https://www.framer.com/marketplace/components/csv-data-pro/) | Importar planillas (tarifas, peajes, servicios que mandan las prestadoras) con vista previa en tabla —buscar, ordenar, marcar errores— antes de guardar | Pendiente |
