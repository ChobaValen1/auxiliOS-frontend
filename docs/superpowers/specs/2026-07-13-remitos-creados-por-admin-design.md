# Remitos creados por admin — pre-carga asignada y cierre administrativo

**Fecha:** 2026-07-13 · **Estado:** aprobado por Valentín (mockup `mockup_remito_admin_crear.html`)

## Qué se construye

Botón **"➕ Nuevo remito"** en la vista Remitos del admin. Abre un formulario
(Servicio, Cliente, Recorrido, Importes opcionales, Observaciones, selector de
chofer) con dos salidas:

1. **📤 Asignar a chofer (pre-carga):** `status='pendiente'`, `driver_id` del
   chofer elegido. El chofer la ve en su lista con badge "📥 Asignado por admin"
   y la completa con el asistente de siempre (prefill existente); **espera la
   firma del socio** para pasar a Firmado. Requiere chofer + (patente o cliente).
2. **✅ Cerrar por administración:** `status='cerrado_admin'`, sin firma.
   Estado propio "🏢 Cerrado por administración" (pill azul). Requiere
   (patente o cliente). **Corrección 2026-07-13:** si se eligió chofer, el
   remito queda a su cuenta (`driver_id` del chofer): el chofer lo ve en su
   lista (solo lectura) y cuenta en TODOS sus conceptos (facturación,
   rendiciones/efectivo esperado, KPIs). Sin chofer elegido → `driver_id=null`.

El admin puede cargar el remito de punta a punta y aún así asignarlo (el chofer
solo consigue la firma).

## Cambios de base (migración)

- `remitos_status_check`: agregar `'cerrado_admin'` a los valores permitidos
- Columna nueva `creado_por UUID REFERENCES users(user_id)` — quién lo creó
  (null = flujo viejo del chofer). Sirve para el badge y la trazabilidad.

## Impacto en módulos relacionados (auditado)

- **Facturación / rendiciones / sueldos / comparativos / jornadas admin:** usan
  `.neq('status','anulado')` → `cerrado_admin` queda incluido como facturado
  SIN cambios. Rendiciones no se afectan porque el cierre admin va sin chofer.
- **`_mapRemitoRow` (supabase.js:490):** mapear `cerrado_admin` explícito (hoy
  cualquier estado desconocido cae en 'pendiente'). Agregar `creadoPor`.
- **Pills:** `generarHtmlPill` (sigma.js:6639), pill del detalle chofer
  (sigma.js:2160) y `_raRender` → rama nueva azul "🏢 Cerrado por administración".
- **Filtro de estado de la lista:** agregar opción "Cerrado por admin".
- **`_remitoIncompleto`:** `cerrado_admin` NO cuenta como incompleto (no espera
  firma ni datos del chofer).
- **Botón "Completar" del chofer:** ya se muestra para pendientes; los
  `cerrado_admin` no le llegan (driver_id null). Sin cambios.
- **Guardado del chofer:** el upsert existente por `onConflict:'nro_remito'`
  actualiza la misma fila de la pre-carga. Verificar que el payload del chofer
  no pise `creado_por` ni `historial_ediciones`.

## Trazabilidad

Al crear, se agrega entrada en `historial_ediciones`:
`{fecha, user_id, user_nombre, cambios:[{campo:'_creacion', antes:null, despues:'pre-carga'|'cerrado_admin'}]}`
y el detalle admin muestra "Creado por X" en Trazabilidad.

## Permisos

Solo `administracion` ve el botón y puede crear. Supervisión y chofer sin cambios.
