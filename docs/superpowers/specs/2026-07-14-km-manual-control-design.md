# Control de KM cargados a mano (IA vs chofer)

**Fecha:** 2026-07-14 · **Mockup aprobado:** `mockup_km_manual_control.html`

## Objetivo

Cuando el lector de IA del odómetro no puede analizar la foto (o el chofer corrige
el valor leído), hoy no queda rastro: el KM guardado es indistinguible de una
lectura validada por IA. Administración necesita:

1. Una **alerta** cada vez que un KM se cargó a mano (salvo modo offline).
2. En **Jornadas**, ver la comparación: *resultado generado por IA* vs
   *resultado generado por chofer*.

## Casos cubiertos

| Origen | Qué pasó | ¿Alerta? |
|---|---|---|
| `ia` | La IA leyó y el chofer no tocó el valor | No |
| `manual_ia_fallo` | La IA no pudo leer, el chofer tipeó el KM | **Sí** |
| `manual_editado` | La IA leyó X, el chofer lo cambió a Y | **Sí** |
| `manual_offline` | Sin señal: la foto quedó en el teléfono, KM a mano | No (solo marca) |
| `NULL` | Jornadas anteriores a esta feature | No (se muestra "—") |

El origen se registra **por separado para inicio y cierre** de jornada.

## Datos (migración)

**`daily_logs` — 4 columnas nuevas:**

```sql
ALTER TABLE daily_logs
  ADD COLUMN km_inicio_ia     integer,   -- qué leyó la IA (NULL si no leyó)
  ADD COLUMN km_inicio_origen text CHECK (km_inicio_origen IN ('ia','manual_ia_fallo','manual_editado','manual_offline')),
  ADD COLUMN km_final_ia      integer,
  ADD COLUMN km_final_origen  text CHECK (km_final_origen  IN ('ia','manual_ia_fallo','manual_editado','manual_offline'));
```

**`alertas_operativas` — soporte del tipo nuevo:**

```sql
-- ampliar CHECK de tipo: + 'km_manual'
-- columnas nuevas: log_id integer REFERENCES daily_logs, extremo text ('inicio'|'final')
```

`diferencia_monto` reutilizado: `km_chofer − km_ia` cuando la IA leyó algo
(caso `manual_editado`); NULL cuando la IA falló.

**Trigger `trg_daily_logs_alerta_km_manual`** (AFTER INSERT OR UPDATE en
`daily_logs`): por cada extremo cuyo origen sea `manual_ia_fallo` o
`manual_editado`, inserta una alerta `km_manual` pendiente si no existe ya una
para ese `(log_id, extremo)`. Al ser trigger, también cubre las jornadas que
sincronizan desde el outbox offline horas después.

## Captura en la app del chofer (`sigma.js`)

Variables por jornada: `_kmIaInicio`, `_kmIaFinal` (lectura IA) y el origen.

- `procesarFotoConIA` éxito → guarda el KM leído y origen provisorio `ia`.
- `procesarFotoConIA` error (catch) → origen `manual_ia_fallo`, muestra el área
  manual (hoy solo cambia el texto; se agrega mostrar el campo).
- Rama offline existente → origen `manual_offline`.
- `editarKmManual` / `editarKmManualInicio` → si había lectura IA y el valor
  final difiere, origen `manual_editado`.
- Al confirmar inicio/cierre: si el valor del input coincide con la lectura IA,
  el origen queda `ia` (tocar "editar" sin cambiar nada no genera alerta).

Los 2 campos (`km_X_ia`, `km_X_origen`) viajan en los payloads de
`iniciarJornadaCompleta` y `cerrarJornada`, y en los payloads del outbox
(`jornada_inicio` / `jornada_cierre`) sin cambios de estructura del outbox.

## Vistas de administración

**Lista de Jornadas:** badge por fila según el peor origen de la jornada:
`✏️ A MANO` (ámbar) > `📴 SIN SEÑAL` (gris) > `✓ IA` (verde) > `—` (sin dato).

**Detalle de jornada — tarjeta Odómetro:** debajo de las fotos, un bloque por
extremo con carga manual (según mockup):

- *Resultado generado por IA:* `248.450 km` / "— no pudo leer la foto" / "— sin conexión"
- *Resultado generado por chofer:* `248.512 km`
- *Diferencia:* `+62 km` (solo caso `manual_editado`)

Si ambos extremos fueron por IA, la tarjeta queda como está hoy.

**Panel de alertas:** tipo nuevo `✏️ KM cargado a mano` junto a las de efectivo.
Cuerpo: chofer, camión, extremo, KM IA vs KM chofer. Acciones: **Ver jornada**
(abre el detalle), **Aprobar** / **Rechazar** con nota de revisión obligatoria —
mismo flujo de estados que las alertas existentes (`pendiente → aprobado/rechazado`).

## Fuera de alcance

- No se bloquea el cierre de jornada ni se pide confirmación extra al chofer.
- No se recalcula nada retroactivo: jornadas viejas quedan con origen NULL.
- El KM que vale para camión/liquidaciones sigue siendo el confirmado
  (`km_inicio`/`km_final`); la lectura IA es solo trazabilidad.

## Verificación

1. Jornada con IA OK → sin alerta, badge `✓ IA`.
2. Foto ilegible → campo manual habilitado, al cerrar aparece alerta
   `manual_ia_fallo` y la comparación en el detalle.
3. IA lee y chofer corrige → alerta con diferencia en km.
4. Modo avión → badge `📴 SIN SEÑAL`, sin alerta, y al sincronizar el outbox
   no se genera alerta.
5. Aprobar/rechazar alerta con nota → cambia estado y queda trazado.
