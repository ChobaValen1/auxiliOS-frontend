/* AuxiliOS · Rendimiento de combustible (km/l) v1

   Una carga rinde: km desde la carga anterior del mismo móvil sobre los litros de la carga nueva.
   Sólo se calcula cuando el dato es confiable; si no, se dice por qué (para mostrar "—" con su motivo
   en vez de un número inventado):
     sin_litros      la carga no tiene litros
     sin_odometro    la carga no tiene odómetro
     sin_anterior    no hay una carga anterior con odómetro para comparar
     intermedia      entre las dos cargas hay otra sin odómetro: sus litros faltarían en la cuenta
     inconsistente   el odómetro baja o salta más de 3.000 km entre cargas
   Una jornada suma los km y los litros de sus cargas válidas (no promedia promedios).
   Consumo alto: rinde menos del 75 % del promedio del móvil (con al menos 3 cargas válidas). */
(function (global) {
  'use strict';

  var KM_MAX_ENTRE_CARGAS = 3000, UMBRAL_BAJO = 0.75, MIN_PARA_PROMEDIO = 3;
  var PRIORIDAD = ['inconsistente', 'sin_odometro', 'intermedia', 'sin_anterior', 'sin_litros'];
  var MENSAJES = {
    sin_carga: 'Sin carga de combustible en la jornada',
    sin_litros: 'La carga no tiene litros',
    sin_odometro: 'La carga no tiene odómetro: no se puede calcular',
    sin_anterior: 'No hay una carga anterior con odómetro para comparar',
    intermedia: 'Hay una carga sin odómetro entre ésta y la anterior',
    inconsistente: 'El odómetro entre cargas no cierra (baja o salta más de 3.000 km)'
  };

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function r1(n) { return Math.round(n * 10) / 10; }
  function cronologico(a, b) {
    var fa = String(a.fuel_date || ''), fb = String(b.fuel_date || '');
    if (fa !== fb) return fa < fb ? -1 : 1;
    return num(a.fuel_id) - num(b.fuel_id);
  }

  /* fuel: todas las cargas de UN móvil (sin las anuladas). → { fuel_id: { kml, km, litros } | { razon } } */
  function porCarga(fuel) {
    var cargas = (fuel || []).filter(function (f) { return !f.voided_at; }).slice().sort(cronologico);
    var out = {}, kmPrevio = null, sinKmEntre = false;
    cargas.forEach(function (f) {
      var litros = num(f.liters), tieneKm = f.km_at_load !== null && f.km_at_load !== undefined && f.km_at_load !== '';
      if (litros <= 0) { out[f.fuel_id] = { razon: 'sin_litros' }; return; }
      if (!tieneKm) { out[f.fuel_id] = { razon: 'sin_odometro' }; sinKmEntre = true; return; }
      var km = num(f.km_at_load);
      if (kmPrevio === null) out[f.fuel_id] = { razon: 'sin_anterior' };
      else if (sinKmEntre) out[f.fuel_id] = { razon: 'intermedia' };
      else {
        var d = km - kmPrevio;
        out[f.fuel_id] = (d <= 0 || d > KM_MAX_ENTRE_CARGAS) ? { razon: 'inconsistente' } : { kml: r1(d / litros), km: d, litros: litros };
      }
      kmPrevio = km; sinKmEntre = false;
    });
    return out;
  }

  /* Promedio del móvil: media de lo que rindió cada carga válida; sin al menos 3, no hay promedio confiable. */
  function promedio(mapa) {
    var v = Object.keys(mapa || {}).map(function (k) { return mapa[k].kml; }).filter(function (x) { return x != null; });
    return v.length >= MIN_PARA_PROMEDIO ? r1(v.reduce(function (a, b) { return a + b; }, 0) / v.length) : null;
  }

  /* Lo de una jornada: las cargas del día (con su id) contra el mapa del móvil. */
  function deJornada(cargasDelDia, mapa, prom) {
    var cargas = cargasDelDia || [];
    if (!cargas.length) return { estado: 'sin_carga', razon: 'sin_carga', cargas: 0, mensaje: MENSAJES.sin_carga };
    var validas = cargas.filter(function (c) { return mapa && mapa[c.fuel_id] && mapa[c.fuel_id].kml != null; });
    if (!validas.length) {
      var razones = cargas.map(function (c) { return (mapa && mapa[c.fuel_id] || {}).razon; });
      var razon = PRIORIDAD.filter(function (p) { return razones.indexOf(p) >= 0; })[0] || 'sin_odometro';
      return { estado: 'sin_dato', razon: razon, cargas: cargas.length, mensaje: MENSAJES[razon] };
    }
    var km = 0, litros = 0;
    validas.forEach(function (c) { km += mapa[c.fuel_id].km; litros += mapa[c.fuel_id].litros; });
    var kml = r1(km / litros), bajo = prom != null && prom > 0 && kml < prom * UMBRAL_BAJO;
    return { estado: 'ok', kml: kml, km: km, litros: litros, cargas: cargas.length, validas: validas.length,
      parcial: validas.length < cargas.length, promedio: prom, bajo: bajo };
  }

  global.AuxiliosFuelEfficiency = { porCarga: porCarga, promedio: promedio, deJornada: deJornada, MENSAJES: MENSAJES, UMBRAL_BAJO: UMBRAL_BAJO };
  if (typeof module !== 'undefined') module.exports = global.AuxiliosFuelEfficiency;
})(typeof window !== 'undefined' ? window : globalThis);
