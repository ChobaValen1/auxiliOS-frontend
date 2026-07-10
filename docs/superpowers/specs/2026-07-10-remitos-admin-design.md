# Remitos admin — vista global + detalle completo editable

**Fecha:** 2026-07-10 · **Estado:** aprobado por Valentín (mockup `mockup_remitos_admin.html`)

## Problema

La tabla `remitos` guarda ~40 campos (teléfono, email, CUIT, fotos, km reales,
conformidades, historial de ediciones…) pero el detalle actual muestra solo una
parte, y no se sabe si un campo está vacío o no existe. Además el admin no tiene
una vista global de remitos comparable al hub de Jornadas, ni forma de corregir
un dato mal cargado.

## Solución (2 partes)

### Parte 1 — Vista global "Remitos" para admin

Cuando un usuario **admin** entra a la sección Remitos, ve el hub global en vez
de la vista de chofer (el chofer conserva su pantalla actual sin cambios):

- **KPIs del período:** cantidad de remitos, total facturado, KM facturados,
  remitos con datos incompletos (sin teléfono, sin km, sin fotos o sin firma)
- **Filtros:** búsqueda libre (nro, cliente, patente), chofer, estado
  (firmado / pendiente / anulado), rango de fechas — mismo patrón que Jornadas
- **Tabla:** una fila por remito → Remito, Fecha·hora, Chofer, Cliente
  (con ⚠ si le faltan datos), Recorrido (origen → destino), KM, Total, Pago, Estado.
  Los anulados se ven atenuados. Clic en la fila abre el detalle (Parte 2).

### Parte 2 — Detalle completo

Modal con TODOS los campos de la base, agrupados. **Regla de oro: lo vacío se
muestra en rojo como "— sin cargar", nunca se oculta.**

| Grupo | Campos | ¿Editable? |
|---|---|---|
| Encabezado | nro_remito, chofer, jornada, móvil, estado | No |
| Servicio | nro_servicio, tipo_servicio, patente + marca_modelo, cliente_presente | **Sí** |
| Cliente | razon_social, cuit, telefono, email_cliente | **Sí** |
| Recorrido | origen, destino, km_reales | **Sí** |
| Importes y pago | imp_peaje, imp_excedente, imp_otros, imp_total_extras, pago_1 (método+monto), pago_2 (método+monto) | **Sí** |
| Conformidades | conformidad_servicio, conformidad_cargos, sin_danos, conformidad_arrastre | **Sí** |
| Fotos del servicio | foto_urls (miniaturas, clic abre grande) | No |
| Firma | firma_imagen_url + firmado_at | No — la firma recolectada queda siempre |
| Observaciones | observaciones | **Sí** |
| Trazabilidad | created_at_device, received_at, sync_status + **lista de ediciones** | No (solo lectura) |

### Edición con trazabilidad

- Cada grupo editable tiene un botón **✏️ Editar** (solo admin) que convierte
  sus campos en inputs; "Guardar" y "Cancelar" por grupo.
- Al guardar: `UPDATE remitos` con los campos del grupo **y** se agrega una
  entrada al jsonb `historial_ediciones`:
  ```json
  { "fecha": "2026-07-10T15:20:00Z", "user_id": "…", "user_nombre": "Valentín",
    "cambios": [ { "campo": "km_reales", "antes": 10, "despues": 12 } ] }
  ```
  Solo se registran los campos que realmente cambiaron; si no cambió nada, no
  se guarda ni se anota.
- La sección Trazabilidad muestra cada edición: fecha, quién y qué cambió
  (campo: antes → después).
- `imp_total_extras`: si en la DB es columna generada se recalcula sola; si no,
  se recalcula en el update como peaje + excedente + otros (verificar en DB real
  durante la implementación).

## Permisos

- Hub global y edición: solo `administracion`
- `supervision`: puede ver el hub y el detalle, sin botones de edición
- `chofer`: sin cambios (su pantalla actual queda igual)

## Fuera de alcance

- No se editan fotos ni firma (ni agregar ni borrar)
- No se cambia el flujo de carga del chofer ni el wizard
- Anular remito ya existe y se mantiene como está
- Sin cambios de esquema salvo verificación de `historial_ediciones` (ya existe como jsonb)

## UI / archivos

- `Index.html`: hub admin (KPIs + filtros + tabla) y modal de detalle nuevo
- `sigma.js`: render del hub, detalle, modo edición por grupo, registro de historial
- `supabase.js`: query del hub (remitos + join users/daily_logs/trucks) y update con historial
- `sw.js`: bump de versión
- Mockup aprobado: `mockup_remitos_admin.html`
