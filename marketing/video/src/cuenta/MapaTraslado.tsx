import * as turf from "@turf/turf";
import type { Feature, LineString } from "geojson";
import * as maplibregl from "maplibre-gl";
import { type GeoJSONSource, type Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import React, { useEffect, useRef, useState } from "react";
import { continueRender, delayRender } from "remotion";
import leg1 from "../../data/osrm-cuenta/leg1.json";
import leg2 from "../../data/osrm-cuenta/leg2.json";
import leg3 from "../../data/osrm-cuenta/leg3.json";

// Mapa real del traslado con MapLibre (estilo «fiord» de OpenFreeMap) y Turf.
// Recorrido calculado con OSRM (routing.openstreetmap.de, 9/11/2026):
// Monte Grande → San Vicente (29 km) → La Plata (53 km) → Monte Grande (65 km).
// La cámara queda fija; por cuadro solo cambian las líneas, la grúa y las etiquetas.
export const CELESTE = "#4fc3f7";
export const AMBAR = "#f5a623";
export const CORAL = "#ff7a6b";
export const COLORES = [CELESTE, AMBAR, CORAL];

type LL = [number, number];
const RUTAS: Feature<LineString>[] = [leg1, leg2, leg3].map((l) => turf.lineString(l.routes[0].geometry.coordinates as LL[]));
const LARGOS = RUTAS.map((r) => turf.length(r));
export const KM_REALES = [leg1, leg2, leg3].map((l) => Math.round(l.routes[0].distance / 1000)); // 29, 52, 65

// dónde está el peaje de la autopista (Hudson) sobre la vuelta, como fracción del tramo
const HUDSON: LL = [-58.164, -34.79];
export const PEAJE_EN = (turf.nearestPointOnLine(RUTAS[2], HUDSON).properties.location ?? 0) / LARGOS[2];

const LUGARES = [
  { ll: RUTAS[0].geometry.coordinates[0] as LL, nombre: "Base · Monte Grande", color: "#ffffff", anchor: "top", offset: [0, 0.9] },
  { ll: RUTAS[1].geometry.coordinates[0] as LL, nombre: "Origen · San Vicente", color: CELESTE, anchor: "top", offset: [0, 0.9] },
  { ll: RUTAS[2].geometry.coordinates[0] as LL, nombre: "Destino · La Plata", color: AMBAR, anchor: "top", offset: [0, 0.9] },
];
const ETIQUETAS = ["a buscarlo", "con el auto arriba", "vuelve vacío"];

const tramo = (i: number, p: number) => turf.lineSliceAlong(RUTAS[i], 0, Math.max(0.001, LARGOS[i] * Math.min(1, Math.max(0, p))));
const punto = (i: number, p: number) => turf.along(RUTAS[i], LARGOS[i] * Math.min(1, Math.max(0, p))).geometry.coordinates as LL;

// progreso de cada tramo (0..1)
export const MapaTraslado: React.FC<{ avance: [number, number, number]; width: number; height: number; padding: { top: number; bottom: number; left: number; right: number } }> = ({ avance, width, height, padding }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MLMap | null>(null);
  const [carga] = useState(() => delayRender("Cargando el mapa"));

  useEffect(() => {
    if (!ref.current) return;
    const todos = RUTAS.flatMap((r) => r.geometry.coordinates as LL[]);
    const bbox = turf.bbox(turf.lineString(todos)) as [number, number, number, number];
    const m = new maplibregl.Map({
      container: ref.current,
      style: "https://tiles.openfreemap.org/styles/fiord",
      bounds: [[bbox[0], bbox[1]], [bbox[2], bbox[3]]],
      fitBoundsOptions: { padding },
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });
    m.on("load", () => {
      m.addSource("todo", { type: "geojson", data: turf.featureCollection(RUTAS) });
      m.addLayer({ id: "todo", type: "line", source: "todo", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "rgba(255,255,255,0.16)", "line-width": 10 } });
      RUTAS.forEach((_, i) => {
        m.addSource(`t${i}`, { type: "geojson", data: tramo(i, 0) });
        m.addLayer({
          id: `t${i}-borde`, type: "line", source: `t${i}`, layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#0b1020", "line-width": 18, "line-opacity": i === 2 ? 0 : 0.9 },
        });
        m.addLayer({
          id: `t${i}`, type: "line", source: `t${i}`, layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": COLORES[i], "line-width": i === 1 ? 12 : 10, ...(i === 2 ? { "line-dasharray": [0.1, 2] } : {}) },
        });
      });
      m.addSource("lugares", { type: "geojson", data: turf.featureCollection(LUGARES.map((l) => turf.point(l.ll, { nombre: l.nombre, color: l.color, anchor: l.anchor, offset: l.offset }))) });
      m.addLayer({ id: "lugares", type: "circle", source: "lugares", paint: { "circle-radius": 13, "circle-color": ["get", "color"], "circle-stroke-color": "#0b1020", "circle-stroke-width": 6 } });
      m.addLayer({
        id: "lugares-txt", type: "symbol", source: "lugares",
        layout: { "text-field": ["get", "nombre"], "text-font": ["Noto Sans Bold"], "text-size": 30, "text-anchor": ["get", "anchor"], "text-offset": ["get", "offset"], "text-allow-overlap": true, "text-ignore-placement": true },
        paint: { "text-color": "#ffffff", "text-halo-color": "#0b1020", "text-halo-width": 4 },
      });
      m.addSource("km", { type: "geojson", data: turf.featureCollection([]) });
      m.addLayer({
        id: "km", type: "symbol", source: "km",
        layout: { "text-field": ["get", "txt"], "text-font": ["Noto Sans Bold"], "text-size": 29, "text-allow-overlap": true, "text-ignore-placement": true, "text-anchor": ["get", "anchor"], "text-offset": ["get", "offset"], "text-max-width": 40 },
        paint: { "text-color": ["get", "color"], "text-halo-color": "#0b1020", "text-halo-width": 5 },
      });
      m.addSource("peaje", { type: "geojson", data: turf.featureCollection([]) });
      m.addLayer({ id: "peaje", type: "circle", source: "peaje", paint: { "circle-radius": 14, "circle-color": CORAL, "circle-stroke-color": "#ffffff", "circle-stroke-width": 4 } });
      m.addLayer({
        id: "peaje-txt", type: "symbol", source: "peaje",
        layout: { "text-field": "Peaje + $ 1.400", "text-font": ["Noto Sans Bold"], "text-size": 28, "text-anchor": "bottom", "text-offset": [0, -1.1], "text-allow-overlap": true, "text-ignore-placement": true },
        paint: { "text-color": CORAL, "text-halo-color": "#0b1020", "text-halo-width": 4 },
      });
      m.addSource("grua", { type: "geojson", data: turf.featureCollection([]) });
      m.addLayer({ id: "grua-halo", type: "circle", source: "grua", paint: { "circle-radius": 34, "circle-color": AMBAR, "circle-opacity": 0.25 } });
      m.addLayer({ id: "grua", type: "circle", source: "grua", paint: { "circle-radius": 18, "circle-color": AMBAR, "circle-stroke-color": "#ffffff", "circle-stroke-width": 6 } });
      m.once("idle", () => {
        setMap(m);
        continueRender(carga);
      });
    });
    // sin m.remove(): puede cortar el ciclo de render de Remotion
  }, [carga, padding]);

  const [a0, a1, a2] = avance;
  useEffect(() => {
    if (!map) return;
    const h = delayRender("Cuadro del mapa");
    const av = [a0, a1, a2];
    av.forEach((p, i) => (map.getSource(`t${i}`) as GeoJSONSource | undefined)?.setData(tramo(i, p)));
    // la grúa va en el tramo que se está haciendo
    const i = a1 <= 0 ? 0 : a2 <= 0 ? 1 : 2;
    const empezo = a0 > 0;
    (map.getSource("grua") as GeoJSONSource | undefined)?.setData(turf.featureCollection(empezo ? [turf.point(punto(i, av[i]))] : []));
    // el km de cada tramo, en la mitad del recorrido, cuando arranca
    const anclas = ["left", "bottom", "top"];
    const km = av
      .map((p, k) => (p > 0.15 ? turf.point(punto(k, [0.68, 0.55, 0.3][k]), { txt: `${KM_REALES[k]} km · ${ETIQUETAS[k]}`, color: COLORES[k], anchor: anclas[k], offset: [[0.8, 0], [0, -0.8], [0, 0.8]][k] }) : null))
      .filter((x) => x !== null);
    (map.getSource("km") as GeoJSONSource | undefined)?.setData(turf.featureCollection(km));
    (map.getSource("peaje") as GeoJSONSource | undefined)?.setData(turf.featureCollection(a2 >= PEAJE_EN ? [turf.point(punto(2, PEAJE_EN))] : []));
    map.once("idle", () => continueRender(h));
    map.triggerRepaint();
  }, [map, a0, a1, a2]);

  return <div ref={ref} style={{ position: "absolute", left: 0, top: 0, width, height }} />;
};
