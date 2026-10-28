# Mapa de Servicios V1 · v586

28/10/2026. Implementación de la revisión aprobada, lista para publicación en el proyecto productivo `auxilios-frontend`.

## Uso

Servicios → **Mapa**, junto a Lista. Activos/Historial, búsqueda, filtros y paginación mantienen el mismo alcance. Las fichas muestran responsables, horarios registrados, direcciones, remito y cola real del chofer. Los botones abren las acciones existentes; un cierre se refleja según las reglas de Activos/Historial y ofrece un enlace al historial sin cambiar automáticamente de pantalla.

En escritorio hay lista, mapa y detalle. En tablet el lateral alterna entre lista y detalle. En celular el detalle tiene resumen/expandido y acciones accesibles. Incluye tema claro/oscuro, navegación por teclado y movimiento reducido.

## Contrato y límites

- Se reutilizan los servicios enriquecidos con documentos y la actualización existente cada 30 segundos. No hay otra lista ni un segundo motor de estados.
- La consulta existente agrega cuatro coordenadas a Operador/Supervisión y `single_address` a los roles de la mesa. Mantiene las autorizaciones, límites y datos comerciales actuales. Migración productiva: `20261028170351_operator_services_map_coordinates_v1`.
- Script reproducible: [mapa-servicios-v1.sql](mapa-servicios-v1.sql). Reversión: [rollback/mapa-servicios-v1.sql](rollback/mapa-servicios-v1.sql). La migración ejecuta consultas de validación para los roles existentes y comprueba el rechazo de una identidad no autorizada, dentro de la misma transacción.
- Google Maps se carga al abrir Mapa. Se consulta únicamente el recorrido origen → destino del servicio seleccionado; se conserva en memoria durante la sesión. No se reutiliza el circuito de facturación que puede incluir base y retorno. Los recorridos consultados quedan como contexto mientras coincidan las direcciones. No se solicita una ruta para cada servicio al iniciar.
- Las coordenadas faltantes no eliminan servicios de las fichas. Los errores del proveedor tampoco bloquean las acciones. Las respuestas obsoletas se descartan al cambiar de servicio, dirección o sesión. La actualización periódica conserva cámara, foco y menús.
- El alcance coincide con los servicios cargados por la mesa (hasta 500 más activados) y con la página del historial. La cobertura se indica sobre esos resultados.
- Esta versión representa direcciones y recorridos de referencia. No muestra posiciones de teléfonos, trayectos realmente recorridos, disponibilidad inferida de móviles, ETA con tránsito ni recomendaciones automáticas. Continúan en deuda #11.

## Validación

- Sintaxis y controles de seguridad: correctos.
- Pruebas específicas del mapa y del visor de recorridos: correctas.
- `scripts/qa-services-map.cjs`: integración en Chromium con módulos reales y transportes/datos sintéticos. Comprueba filtros compartidos, paginación, ausencia de solicitudes de rutas al iniciar, arribo mediante el formulario existente y recarga, revisión documental pendiente, enlace a historial y retorno, falta de coordenadas, descarte de respuestas atrasadas, conservación del foco, tablet/celular, acciones táctiles de 44 px, rol Supervisión, error del SDK y limpieza al cerrar sesión.
- Batería general: 165 archivos de pruebas pasan; siguen fallando los mismos 12 que fallaban antes de comenzar (164/176 en la base; 165/177 después). Sin nuevas fallas. Entre las previas hay verificaciones antiguas del nombre de caché.
- Migración aplicada y validada en producción. Los avisos del asesor de seguridad conservan sus categorías y cantidades anteriores; no aparecen nuevos avisos por este cambio.
- Las pruebas de flujo no ejecutan asignaciones, arribos ni cierres sobre servicios productivos. La validación del despliegue debe confirmar el SHA servido, el dominio y la configuración pública del mapa.

## Despliegue y reversión

Build `services-map-v586-20261028`; caché `auxilios-v586-services-map`; registro de service worker `v293`. Publicación mediante el repositorio conectado a Vercel. Dominio: https://auxilios-arg.vercel.app.

Se puede volver al despliegue anterior sin revertir inmediatamente SQL: los campos nuevos son aditivos. Si también se revierte SQL, primero restaurar el frontend anterior. El seguimiento GPS y las mejoras posteriores permanecen separados de esta entrega.
