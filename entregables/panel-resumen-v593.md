# Panel · Resumen v593

Resuelve la parte de Resumen de la deuda P4: los seis indicadores y el mapa competían por la primera lectura; la eficiencia se mostraba dos veces. La nueva jerarquía es resultado, evolución, explicación y detalle.

- Tres indicadores principales: total facturado (mayor peso), servicios finalizados y km reales registrados en servicios. Comparación neutral: subir no implica automáticamente mejorar. El período y el intervalo de comparación quedan visibles.
- Ticket promedio, peajes y km facturados pasan a una franja secundaria. Cobertura de km visible; un cero con dato no se confunde con ausencia de dato. No se confunden km de servicios con odómetro de flota.
- Evolución diaria primero: leyenda sólida/discontinua, escala desde cero, segmentos rectos y tabla de valores sincronizada con zoom. Contraste de líneas adaptado al tema. Fallback de tabla si Chart.js no carga.
- Ranking de cinco prestadoras y el resto agrupado, calculado sobre todos los importes recibidos. Etiquetas, importes exactos y porcentajes visibles. Acceso por teclado al detalle de prestadoras/bases.
- Una sola sección de eficiencia. Se elimina la consulta duplicada a dashboard_flota_km_v1; el gráfico canónico conserva su propia fuente y sus controles.
- Geografía y tipos, y detalle de prestadoras, se despliegan a demanda. Mapa diferido hasta abrirlo. Composición por tipo con barras HTML y valores accesibles, en lugar de la dona con un total de servicios que mezclaba unidades.
- Estados vacíos, sin comparación y de error sin cifras anteriores residuales. Recuperación sin duplicar los controles de zoom.

Contrato visual: escritorio tiene evolución dominante y ranking lateral; móvil mantiene facturación primero, servicios/km después y luego evolución. Gráficos editables basados en RPC existentes; la imagen conceptual usa valores ilustrativos y no es fuente de datos. No se cambian reglas de facturación ni permisos ni RPC de negocio. Pendiente: aplicar una revisión equivalente a otras pestañas del Panel.

Verificación: tests de Resumen, eficiencia, zoom y base del Panel; ranking conserva importes y no inventa participaciones sobre cero. Chromium con Chart.js 4.4.3 real, módulos de producción y RPC simuladas: 1440/1024/390/320 px, tema claro/oscuro, filtros, zoom, teclado, mapa diferido, detalle, error/recuperación, sin Chart.js y sin datos. Script: scripts/qa-dashboard-summary.cjs (AUXILIOS_CHART_JS permite indicar una copia local de la misma versión de Chart.js). Sin escrituras de datos reales.
