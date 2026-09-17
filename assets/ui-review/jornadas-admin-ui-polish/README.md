# Capturas · Jornadas · Admin (rediseño visual)

Antes y después del rediseño de `#screen-jornadas-admin`, en los tres anchos
de la verificación: 1440x900, 1117x609 y 390x844.

| Ancho | Antes | Después |
|---|---|---|
| 1440x900 | `antes-1440.webp` | `despues-1440.webp` |
| 1117x609 | `antes-1117.webp` | `despues-1117.webp` |
| 390x844 | `antes-390.webp` | `despues-390.webp` |

`despues-1440-sticky.webp` muestra el encabezado de tabla fijo con la tabla
scrolleada.

## Cómo se generaron

No se pudo entrar al preview de Vercel desde el entorno donde se hizo el
cambio, porque no hay credenciales de Supabase para pasar el login. Las
capturas salen de un harness estático que arma la pantalla con las piezas
reales del repo:

- el markup de `#screen-jornadas-admin` extraído de `Index.html`, con sus
  estilos inline y `nav.sidenav`;
- `sigma.css` completo;
- las funciones de render reales de `sigma.js` (`_jadminRenderFila`,
  `_jadminRenderKpis`, `_jadminFmtHoras`, `_jadminRenderChipCounts`…);
- el instalador del chip de `jornadas-admin-tools-v1.js`;
- datos de muestra fijos, en lugar de las consultas a Supabase.

El "antes" se generó con los mismos archivos tomados de
`feat/integrated-remito-flow-v1`, así que la comparación es sobre el mismo
harness y solo cambia el código.

Los números de las capturas son de muestra: lo que hay que mirar es la
jerarquía visual, el contraste y el layout, no los valores.

**Queda pendiente confirmar la pantalla en el preview de Vercel con datos
reales**, sobre todo nombres de chofer largos y períodos que cruzan de año.

## Por qué están acá y no en `docs/`

`docs/` está en `.gitignore`, así que las capturas no se pueden versionar
ahí. Se dejan en `assets/` para que el PR se lea solo. Son material de
revisión: una vez mergeado y revisado, se pueden borrar sin tocar nada del
funcionamiento.
