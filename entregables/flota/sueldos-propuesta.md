# AuxiliOS Flota · Sueldos: propuesta de rediseño

Maqueta: `sueldos-maqueta.png` (`sueldos-maqueta.html`). Nombres y montos de ejemplo.

## Cómo funciona hoy (y qué falla)

- Cada chofer tiene un **esquema** (`payroll_settings`): básico, valor por km, valor por servicio, presentismo, comisiones y bonos.
- **«Generar liquidaciones» calcula en el navegador**, chofer por chofer, con 5 a 7 consultas cada uno, y guarda el resultado en columnas fijas de `payroll_liquidaciones`.
- Estados: pendiente → aprobada → pagada. El pago se carga con un `prompt()` del navegador y se confirma con `confirm()`.

**Lo que vemos en los datos reales:** de julio a octubre hay 36 liquidaciones pendientes, 2 aprobadas y **ninguna pagada**. Septiembre tiene 5 marcadas «para revisar». El circuito no se termina de usar.

**Problemas de fondo:**
1. **El cálculo vive en el navegador.** Es lento (N choferes × 7 consultas), no es atómico (si se corta, queda a medias) y el importe lo escribe el cliente.
2. **Columnas fijas.** No hay lugar para adelantos, vales, descuentos manuales, bonos puntuales u horas extra sin agregar columnas nuevas.
3. **No hay un «mes» como unidad.** Se revisa chofer por chofer; no hay vista de conjunto, ni cierre del mes, ni pago en lote.
4. **El recibo no muestra de dónde sale cada número** de forma simple (jornadas, servicios, rendiciones).

## Referencias (repositorios de GitHub)

| Repositorio | Estrellas | Qué tomamos |
|---|---|---|
| [frappe/hrms](https://github.com/frappe/hrms) (Frappe HR) | 9,0 k | *Payroll Entry*: una corrida por período que crea todos los recibos de una vez. *Salary Slip* con tablas de **haberes y descuentos** por componente. *Additional Salary* para novedades puntuales (bonos, descuentos). Un recibo enviado no se edita: se anula y se corrige. |
| [horilla-opensource/horilla](https://github.com/horilla-opensource/horilla) | 1,5 k | Recibos generados en lote con estados (borrador → revisión → confirmado → pagado), asignaciones y deducciones por condición, y adelantos o préstamos que se descuentan en cuotas. |
| [OCA/payroll](https://github.com/OCA/payroll) (Odoo Community) | 124 | Reglas salariales con **categorías** (básico, adicionales, descuentos, bruto, neto) y orden, que generan las **líneas del recibo**. Corridas de recibos por período. |

## La propuesta, adaptada a AuxiliOS

### 1. El mes como unidad, con 4 pasos
**Calculado → En revisión → Aprobado → Pagado**, visible arriba de la pantalla (ver maqueta).
- Un botón **«Calcular el mes»** corre en la base, en una sola operación, para todos los choferes. Si falla, no queda nada a medias.
- Mientras el mes no está aprobado se puede **recalcular** cuantas veces haga falta: se respetan las novedades cargadas a mano.
- **Aprobar** congela los importes. Para corregir algo aprobado hay que **reabrir con un motivo**, que queda registrado. Es la idea de «anular y corregir» de Frappe.
- **Pagado** se marca por chofer o en lote, con método, fecha y comprobante, en una ventana propia en vez del `prompt()`.

### 2. Recibo por líneas: haberes y descuentos
Cada liquidación pasa a tener **líneas** (concepto, cantidad × valor, importe, origen):
- **Automáticas:** sueldo básico, kilómetros (con link a las jornadas), servicios (con link a los servicios), presentismo, comisiones, bonos del esquema y faltantes de efectivo de la rendición.
- **Novedades del mes** (como *Additional Salary*), cargadas por administración: adelantos (con fecha), bonos puntuales, descuentos, vales, horas extra.
- Así se suman conceptos nuevos **sin tocar la base**, y el recibo explica cada número.

### 3. Revisión por excepción
Una tabla con todos los choferes del mes (días, km, servicios, haberes, descuentos, neto y estado), totales arriba y **alertas automáticas** para revisar solo lo raro:
- jornadas sin cerrar,
- variación grande contra el mes anterior,
- rendiciones pendientes,
- chofer sin esquema,
- servicios sin remito.

Los que no tienen alertas quedan **«Listos»** y se aprueban todos juntos con **«Aprobar N listos»**.

### 4. Lo que ve cada uno
- **Administración:** todo, incluidos aprobar, pagar y reabrir.
- **Supervisión:** ve todo y no puede modificar nada.
- **Chofer:** solo su recibo, cuando el mes está aprobado, en su app.

### 5. Exportar
- Excel del mes (resumen y líneas).
- Recibo en PDF por chofer.
- Listado para transferencias (chofer, CBU o alias si está cargado, neto).

## Cómo lo haríamos (por etapas, sin cortar lo que hay)

| Etapa | Qué incluye | Base de datos |
|---|---|---|
| **1 · Cálculo en la base** | Función `payroll_calcular_mes_v1` que reproduce **exactamente** el cálculo de hoy, del lado del servidor, en una sola operación. Se valida que dé los mismos importes que el cálculo actual para julio a octubre antes de reemplazarlo. | Función nueva. Sin cambios en las tablas. |
| **2 · Líneas y novedades** | Tablas `payroll_lineas` y `payroll_novedades`. El recibo se arma con líneas y se pueden cargar adelantos y bonos. Las columnas actuales se siguen llenando para no romper nada. | 2 tablas nuevas, solo para administración y supervisión. |
| **3 · Pantalla nueva** | La pantalla de la maqueta: los 4 pasos, la tabla con alertas, el panel del recibo, aprobar en lote, pagar con ventana propia y reabrir con motivo. | Tabla de corridas por mes (`payroll_corridas`) con estado y auditoría. |
| **4 · Recibo para el chofer y exportaciones** | Recibo en la app del chofer, PDF, Excel y listado de transferencias. | Lectura del chofer solo de sus recibos aprobados. |

Cada etapa sigue la regla de siempre:
1. plan corto;
2. prueba con vuelta atrás (sin aplicar nada);
3. aplicar;
4. probar en la versión de prueba;
5. publicar solo con «dale».

**Importante:** prueba y producción de Flota comparten la base, así que cada cambio de base impacta en la operación real desde el primer momento. Por eso la etapa 1 no cambia nada visible y se compara contra los importes reales antes de usarla.

## Decisiones que necesito
1. **¿Arrancamos por la etapa 1?** Es invisible para el usuario y sin riesgo.
2. **Novedades:** ¿qué conceptos usan hoy fuera del sistema? (adelantos, vales, multas, horas extra, viáticos…)
3. **Adelantos:** ¿se descuentan todos en el mes o pueden ir en cuotas?
4. **¿El chofer tiene que ver su recibo en la app?**
