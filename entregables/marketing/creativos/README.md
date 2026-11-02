# Creativos · Anuncios de Meta de AuxiliOS Solo (prueba 1)

Los textos de cada anuncio están en `../anuncios-meta-solo-v1.md`. Todas las pantallas usan **datos de ejemplo** y así lo aclaran.

| Archivo | Anuncio | Formato | Dónde va |
|---|---|---|---|
| `a1-remito-4x5.jpg` | 1 · Remito perdido | Imagen 1080×1350 | Feed |
| `a1-remito-9x16.jpg` | 1 · Remito perdido | Imagen 1080×1920 | Historias y Reels |
| `a2-carrusel-1-facturaste.jpg` · `-2-se-fue.jpg` · `-3-te-quedo.jpg` | 2 · Lo que queda del mes | Carrusel 1080×1080, en ese orden | Feed |
| `a2-lo-que-queda-9x16.mp4` | 2 · Lo que queda del mes | Video de 15 s, 1080×1920, sin sonido | Reels e Historias |
| `a3-prestadoras-4x5.jpg` | 3 · Facturar a cada prestadora | Imagen 1080×1350 | Feed |
| `a3-prestadoras-9x16.jpg` | 3 · Facturar a cada prestadora | Imagen 1080×1920 | Historias |
| `a3-prestadoras-9x16.mp4` | 3 · Facturar a cada prestadora | Video de 15 s, 1080×1920, sin sonido | Reels e Historias |

**Sonido:** los videos no tienen audio. Al cargarlos en Meta (o en CapCut), sumá una música de la biblioteca libre. Los textos en pantalla ya funcionan como subtítulos.

**Zonas seguras:** los textos quedan entre el 13 % y el 80 % del alto, para que no los tapen el nombre de la página ni el botón en Reels.

## Video del anuncio 1 (lo grabás vos)

El anuncio 1 funciona mucho mejor con imágenes reales. Con el celular alcanza: vertical, 4K o 1080p, con luz de la grúa o de las balizas.

| Segundos | Plano | Texto en pantalla |
|---|---|---|
| 0–2 | Primer plano: remito de papel mojado o arrugado en la guantera | “¿Y este servicio quién lo cobra?” |
| 2–5 | Grúa en la banquina de noche, balizas prendidas | — |
| 5–8 | Manos sacando fotos del auto con el celular (frente, lateral) | “Fotos del vehículo” |
| 8–11 | Otra persona firma con el dedo en la pantalla | “Firma del socio en el celular” |
| 11–13 | Pantalla: el remito saliendo por WhatsApp | “Se lo mandás al toque” |
| 13–15 | Placa final (podés usar `a1-remito-9x16.jpg`) | “Remito digital para grueros · Probala gratis” |

Grabá cada plano dos o tres veces y de 5 segundos, así hay de dónde cortar. Si me pasás los clips, lo armo con los textos y la placa final.

## Cómo cambiar textos o números

`fuentes/video-a2.html` y `fuentes/video-a3.html` son las escenas; `fuentes/video.js` las pasa a cuadros:

```bash
node video.js $PWD/video-a2.html /tmp/cuadros 15
ffmpeg -framerate 30 -i /tmp/cuadros/f%04d.jpg -c:v libx264 -pix_fmt yuv420p -crf 20 salida.mp4
```
