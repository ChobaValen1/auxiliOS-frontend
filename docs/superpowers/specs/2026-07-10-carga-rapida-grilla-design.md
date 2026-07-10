# Carga rápida por rango — Grilla mensual

**Fecha:** 2026-07-10 · **Estado:** aprobado por Valentín

## Problema

Cargar la grilla mensual lleva mucho tiempo: el admin va celda por celda
(día × móvil). El patrón real es casi siempre "mismo chofer en el mismo
móvil varios días seguidos, con francos regulares".

## Solución

Botón **"⚡ Carga rápida"** en la barra de la Grilla (junto a "Copiar
semana", visible solo para admin) que abre un modal para asignar un chofer
a un móvil por un rango de fechas de una sola vez.

## Modal

| Campo | Detalle |
|---|---|
| Chofer | Select de choferes activos (`users`, role_id 3, is_active) |
| Móvil | Select de móviles activos (mismos de la grilla) |
| Desde / Hasta | Inputs date; default: hoy → último día del mes visible |
| Días de franco | 7 pills Lun–Dom, multi-selección (toggle) |

**Vista previa en vivo:** al cambiar cualquier campo se recalcula un texto:
"Se van a cargar **X días**: **[chofer]** en el móvil **[N]** del DD/MM al
DD/MM, con franco los [días] (N días)" + aviso "los días que ya tenían algo
cargado se pisan".

**Botón confirmar:** "Cargar X días" (deshabilitado si falta chofer, móvil
o el rango es inválido).

## Comportamiento al confirmar

- Genera una fila por día del rango: `{ fecha, truck_id, driver_id, estado }`
  - Día normal → `estado: 'asignado'`, `driver_id` del chofer
  - Día cuya semana cae en pill de franco → `estado: 'franco'`, `driver_id: null`
    (igual que hace `copiarSemanaGrilla`)
- Un solo upsert a `asignaciones_grilla` con `onConflict: 'fecha,truck_id'`
- Éxito: toast + `cargarGrilla()`; error: toast de error, no cierra el modal

## Validaciones

- `desde <= hasta`
- Rango máximo **62 días** (evita cargas accidentales gigantes)
- Chofer y móvil obligatorios

## Fuera de alcance

- Sin cambios de esquema en la base (usa `asignaciones_grilla` tal cual)
- No reemplaza la edición por celda ni "Copiar semana"/"Generar mes" — conviven
- Estado "taller" no se carga desde este modal (se marca por celda como hoy)

## UI / archivos

- `Index.html`: botón + modal (patrón de modales existente)
- `sigma.js`: lógica del modal, preview y upsert (junto a las funciones de grilla, ~línea 16000)
- `sw.js`: bump de versión de caché
- Mockup aprobado: `mockup_carga_masiva_grilla.html` (Opción A)
