# Videos de AuxiliOS para Meta Ads

Creativos verticales (1080×1920, 30 fps) hechos con [Remotion](https://www.remotion.dev/). Cada video es código React: los textos, tiempos y colores se cambian en `src/`.

Esta carpeta no forma parte de la app: no la toca el CI del frontend y está excluida del deploy (`.vercelignore` en la raíz).

## Cómo usarlo

```bash
cd marketing/video
npm install
npm run dev          # abre Remotion Studio para ver y editar los videos
npm run lint         # ESLint + TypeScript
```

Para renderizar un video (queda en `out/`, que no se sube al repo):

```bash
npm run render:del-chat
```

También están `render:remito`, `render:comparacion` y `render:mapa`. En un entorno sin el Chrome de Remotion se le pasa el navegador con `-- --browser-executable=<ruta a chrome-headless-shell>`.

## Videos

| Composición | Archivo | Duración | Qué cuenta |
|---|---|---|---|
| `DelChatAlRemito` | `src/chat/DelChatAlRemito.tsx` | 39,9 s | **Primer creativo.** Un particular pide auxilio por WhatsApp, el gruero carga el servicio en AuxiliOS Solo, recorrido en el mapa, remito con fotos y firma, y el remito llega al cliente por WhatsApp. |
| `AnuncioRemito` | `src/AdVideo.tsx` | 17,4 s | El remito de papel perdido = servicio sin cobrar. Remito digital en el celular. |
| `ComparacionSolo` | `src/comparacion/ComparacionVideo.tsx` | 32,5 s | Pantalla partida: el mismo día de un gruero con papel y otro con AuxiliOS Solo. |
| `MapaRecorrido` | `src/mapa/RecorridoScene.tsx` | 14 s | Base → Origen → Destino → Base, Monte Grande → Lomas de Zamora, 22 km. |
| `FirmaPreview` | `src/solo/FirmaPreview.tsx` | 2,5 s | La firma grabada, dibujándose. |

Cada escena también está registrada sola en `src/Root.tsx` (carpetas `Escenas`, `Comparacion-Escenas`, `DelChat-Escenas`) y las pantallas de Solo como imágenes fijas (`Solo-Referencias`).

## De dónde sale cada cosa

- **Pantallas de AuxiliOS Solo** (`src/solo/`): recreadas con los textos, pasos y colores de `solo/solo-ops.js` y `ui/tokens.css`. El mensaje de WhatsApp del cierre es el que arma `sendSheet()`; los links van recortados (`https://…/`) para no inventar un dominio.
- **Datos de ejemplo**: todo es inventado y coherente entre escenas: cliente «Martín Gómez», teléfono 11 5555 0182, patente AB 123 CD, remito N.º 0482, Chevrolet Vectra, $ 60.000, «Grúas Pérez» (el ejemplo del perfil de Solo).
- **Fotos** (`public/fotos/`): del auto propio, con las patentes pixeladas por `scripts/fotos.py`. Las originales no están en el repo.
- **Firma** (`src/solo/firma.json`): grabada con el dedo en una página aparte (nombre inventado). Trazo normalizado 0..1 con su tiempo en ms; `Firma.tsx` la dibuja a la velocidad original o más lenta (en el video, a la mitad).
- **Mapa** (`public/mapa-recorrido.png`): OpenFreeMap (estilo `dark`), apto para uso comercial. La atribución «© OpenFreeMap © OpenMapTiles © OpenStreetMap» tiene que quedar visible.
- **Recorrido** (`data/osrm/`): calles y km reales calculados con OSRM para los tres tramos.
- **Tipografías** (`public/fonts/`): Bebas Neue, DM Sans y JetBrains Mono (licencia OFL), las mismas de la app.
- **Sonidos** (`public/sfx/`): de la librería de efectos de Remotion (`remotion.media`).

## Regenerar el mapa con otros puntos

1. Pedir los tramos a OSRM (lon,lat) y guardarlos en `data/osrm/leg1.json`, `leg2.json`, `leg3.json`:
   ```bash
   curl -s "https://router.project-osrm.org/route/v1/driving/LON1,LAT1;LON2,LAT2?overview=full&geometries=geojson" -o data/osrm/leg1.json
   ```
2. `npm run mapa` dibuja el mapa con MapLibre en Chromium (Playwright) y proyecta el recorrido a píxeles del video en `src/mapa/route.json`.

## Hojas de referencia

`scripts/sheet.py` arma una hoja con varias imágenes y su título (por ejemplo, las pantallas de `Solo-Referencias` renderizadas con `npx remotion still`).
