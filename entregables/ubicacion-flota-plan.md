# Deuda #11 · Ubicación de flota, recomendación y ETA

Fecha: 28/10/2026. Estado: pendiente, en análisis. Este documento registra el pedido; no activa seguimiento, permisos, servicios pagos ni cambios en producción.

**Alcance posterior a la V1:** este plan trata el seguimiento de flota, ETA y recomendaciones. Sus pasos de captura de ubicación no son un requisito para el mapa inicial de Servicios. Ver la [revisión funcional de la V1](mapa-servicios-revision-v1.md), que aprovecha ubicaciones de servicios y flujos existentes.

## Objetivos pedidos

1. Mapa con la posición del teléfono que viaja en la unidad, identificando chofer, móvil y cadena de servicios asignados.
2. Recomendar y, posteriormente, evaluar asignar automáticamente al recurso más conveniente ante un servicio nuevo.
3. Calcular kilómetros por ruta, minutos de viaje y llegada estimada para decidir asignaciones y demoras.

Relacionada con P6 (mapa de operadores) y #10 (referencia visual) en `entregables/DEUDAS.md`.

## Base comprobada en el repositorio

- `manifest.json`, `Index.html` y `sw.js`: aplicación web instalable con service worker. Esto no garantiza geolocalización continua con pantalla bloqueada.
- `supabase/migrations/20260905184058_driver_remito_maps_locations.sql`: coordenadas de origen y destino en servicios y remitos. Revisar cobertura de datos existentes antes del piloto.
- `service-route-map.js`: visor de recorridos con Google Maps.
- `supabase/functions/maps-proxy/index.ts`: integración con Places y Routes, con distancia y duración. Evaluar sus permisos, cuotas, condiciones y soporte de tránsito antes de reutilizarla para seguimiento.
- `docs/driver-live-updates-v1.md`: actualización de asignaciones del chofer. Es una base de integración, no un sistema de ubicación del dispositivo.

Estas observaciones son del código; no verifican aquí configuración, cuotas ni datos de producción.

## Paso 1 · Definir la operación y probar la captura

Resolver primero si los teléfonos son Android, iPhone o mixtos; si pertenecen al móvil o al chofer; y si ya hay GPS de flota con API disponible. Definir cuándo empieza y termina el seguimiento, quién puede consultar la ubicación y cuánto tiempo se conserva.

Recomendación inicial: captura móvil con capacidades nativas de segundo plano y panel operativo en la web actual. Evaluar una app complementaria o una envoltura nativa; envolver la web por sí solo no resuelve permisos ni seguimiento. Si ya existe GPS por unidad, evaluar su integración antes de desarrollar captura propia.

La PWA puede servir para una prueba en primer plano, pero no se ofrecerá como seguimiento continuo confiable. El teléfono representa la posición del dispositivo: hay que confirmar su asociación al móvil durante la jornada.

Piloto con 2–3 unidades y los sistemas operativos reales: pantalla encendida/bloqueada, navegador de navegación abierto, ahorro de batería, pérdida de datos, permiso revocado, proceso terminado y reinicio. Medir antigüedad de las posiciones, precisión reportada, batería y datos durante una jornada. Definir con esos resultados el intervalo objetivo y los límites aceptables; no prometer funcionamiento ininterrumpido.

Salida: elegir fuente de ubicación y documentar resultados antes de construir el mapa de producción.

## Paso 2 · Recepción y calidad de las posiciones

Diseñar una sesión de seguimiento asociada a la jornada, chofer, unidad y dispositivo. Separar última posición de historial opcional; no almacenar recorridos indefinidamente por defecto.

Cada muestra necesita coordenadas WGS84, precisión en metros, hora de captura, hora de recepción y un identificador para evitar duplicados. Velocidad y rumbo son opcionales. Validar sesión activa, identidad, coordenadas y orden temporal en el servidor: una muestra atrasada no debe reemplazar la última posición vigente. La asociación con la unidad debe validarse contra la jornada, no aceptarse libremente del cliente.

Planificar permisos por organización y rol: cada chofer transmite solamente para su sesión; operadores y administradores consultan únicamente su flota autorizada. Aplicar RLS y pruebas de aislamiento al implementar. Limitar frecuencia y volumen, y mantener credenciales privilegiadas fuera del teléfono y del navegador.

Sin conexión: cola local acotada; al reconectar, distinguir muestras históricas de posición actual. Al terminar jornada o cerrar sesión, detener captura y transmisión; prever cierre remoto y vencimiento de sesión. Permiso denegado o GPS desactivado debe dejar un estado visible y permitir continuar la operación manual.

Salida: posiciones válidas y estados de conexión confiables; aún sin automatizar asignaciones.

## Paso 3 · Mapa operativo (primera entrega funcional)

Mapa vial con unidades y puntos de origen/destino de servicios. Al seleccionar una unidad, mostrar chofer, jornada, estado operativo y orden de servicios. Distinguir ubicación medida, ruta calculada y ETA estimada.

Mostrar siempre última actualización y precisión. Definir con el piloto los umbrales de ubicación reciente, atrasada y sin señal. No animar movimiento ficticio ni presentar una posición antigua como actual. Permitir buscar por chofer, móvil y servicio, filtrar y consultar una lista equivalente sin depender del mapa.

En escritorio: mapa y lista/detalle coordinados. En teléfono: etiquetas breves y detalle al tocar; agrupar marcadores cercanos y permitir separarlos al ampliar. Marcadores y controles legibles al hacer zoom. Mostrar fallos de mapa o datos con opción de reintentar, sin perder la lista operativa.

Antes de diseñar la pantalla, registrar proveedores, atribución/licencias, cobertura, frecuencia de actualización, cuotas y política de caché permitida. Evaluar continuar con Google Maps por la integración existente; no mezclar sus datos con otros mapas sin comprobar condiciones.

Salida: Operaciones puede localizar recursos y consultar su cadena, y distingue sin ambigüedad los datos desactualizados.

## Paso 4 · Distancia por ruta y ETA

Separar distancia en línea recta (solo preselección), distancia vial y tiempo de viaje. Consultar rutas para candidatos relevantes, no para toda la flota ante cada muestra GPS. Recalcular por movimiento significativo, cambio de servicio o vencimiento del cálculo; definir límites, caché permitida y presupuesto antes de activarlo.

Para un recurso libre: posición vigente → origen del servicio. Para uno ocupado: tiempo estimado restante del servicio actual + compromisos anteriores + viaje al nuevo origen. Si falta una duración operativa o el orden de la cadena, indicar incertidumbre; no presentar al ocupado como disponible inmediatamente.

Mostrar hora estimada de llegada, minutos de viaje, hora del cálculo y si considera tránsito. Validar restricciones relevantes para grúas y unidades pesadas: una ruta de automóvil no garantiza compatibilidad. No modificar kilómetros facturables, tarifas ni remitos a partir del seguimiento.

Salida: comparar estimaciones con llegadas reales y medir error antes de usarlas para compromisos con clientes.

## Paso 5 · Recomendación asistida

Filtrar primero compatibilidad de unidad, jornada, estado operativo, permisos, disponibilidad y compromisos programados. Ordenar por llegada viable por ruta, no solamente por cercanía física. Una posición desactualizada no puede producir una recomendación de alta confianza.

Ofrecer candidatos con motivo visible: tiempo estimado, ocupación y restricciones. El operador confirma; registrar la recomendación y elección. Revalidar disponibilidad al confirmar para evitar asignaciones simultáneas incompatibles. No cambiar automáticamente el orden de servicios ya comprometidos.

Salida: piloto de recomendaciones, comparando utilidad y ETA con decisiones reales de Operaciones.

## Paso 6 · Demoras y automatización posterior

Alertar cuando la llegada estimada comprometa un horario; agrupar avisos para evitar repeticiones. Configurar tolerancias por operación.

Evaluar asignación automática solo después de validar las recomendaciones: reglas explícitas, recursos excluidos, revalidación transaccional, auditoría y posibilidad de volver al modo manual. Si faltan señal, rutas o datos de disponibilidad, derivar al operador.

## Decisiones pendientes para empezar

- Sistemas operativos y propiedad de los teléfonos; existencia de GPS instalado.
- Cantidad de unidades simultáneas, horas diarias y zona de cobertura.
- Regla de inicio/fin, acceso y retención del seguimiento.
- Fuente de orden y duración prevista de la cadena de servicios.
- Objetivos de frescura, precisión y error de ETA, medidos en piloto.
- Presupuesto de mapas/rutas, cobertura de tránsito y restricciones de unidades.

Cuando se retome el seguimiento de flota, el primer trabajo será validar la fuente de ubicación y su comportamiento real en segundo plano. Mientras tanto, el mapa de Servicios tiene concepto y demo aprobados y puede avanzar de forma independiente con el plan de V1 revisado.
