/* AuxiliOS · maps-proxy: coordenadas pegadas en lugar de una dirección.
   Acepta "-34.6037, -58.3816", "-34,6037; -58,3816", 34°36'13"S 58°22'53"W y enlaces de Google Maps. */
export const COORD_PREFIX = "coord:";
const validPair = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
const pair = (lat, lng) => validPair(lat, lng) ? { latitude: Math.round(lat * 1e7) / 1e7, longitude: Math.round(lng * 1e7) / 1e7 } : null;

export function parseCoordinates(raw) {
  const text = String(raw || "").trim();
  if (!text || text.length > 2000) return null;
  if (text.startsWith(COORD_PREFIX)) return parseCoordinates(text.slice(COORD_PREFIX.length));
  const n = "(-?\\d{1,3}\\.\\d+)";
  // Enlaces de Google Maps: !3d…!4d… (el punto marcado), q=/ll=/query=/destination=, o @lat,lng (el centro del mapa)
  let m = text.match(new RegExp("!3d" + n + "!4d" + n));
  if (!m) m = text.match(new RegExp("[?&](?:q|ll|query|destination|center|daddr)=(?:loc:)?" + n + "(?:,|%2C)\\s*(?:\\+)?" + n, "i"));
  if (!m) m = text.match(new RegExp("@" + n + "," + n));
  if (m) return pair(Number(m[1]), Number(m[2]));
  // Grados, minutos y segundos con hemisferio
  const dms = text.match(/^(\d{1,2})\s*°\s*(\d{1,2})?\s*['′]?\s*(\d{1,2}(?:[.,]\d+)?)?\s*["″]?\s*([NS])[\s,;]+(\d{1,3})\s*°\s*(\d{1,2})?\s*['′]?\s*(\d{1,2}(?:[.,]\d+)?)?\s*["″]?\s*([EWO])$/i);
  if (dms) {
    const dec = (d, mi, se) => Number(d) + Number(mi || 0) / 60 + Number(String(se || 0).replace(",", ".")) / 3600;
    const lat = dec(dms[1], dms[2], dms[3]) * (/s/i.test(dms[4]) ? -1 : 1);
    const lng = dec(dms[5], dms[6], dms[7]) * (/[wo]/i.test(dms[8]) ? -1 : 1);
    return pair(lat, lng);
  }
  // Decimales con punto ("-34.6037, -58.3816") o con coma ("-34,6037; -58,3816" / "-34,6037 -58,3816")
  const clean = text.replace(/^\(|\)$/g, "").replace(/°/g, "").trim();
  const h = clean.match(/^(\d{1,3}\.\d{2,})\s*([NS])\s*[,;\s]\s*(\d{1,3}\.\d{2,})\s*([EWO])$/i);
  if (h) return pair(Number(h[1]) * (/s/i.test(h[2]) ? -1 : 1), Number(h[3]) * (/[wo]/i.test(h[4]) ? -1 : 1));
  m = clean.match(/^(-?\d{1,3}\.\d{2,})\s*[,;\s]\s*(-?\d{1,3}\.\d{2,})$/)
    || clean.match(/^(-?\d{1,3},\d{2,})\s*(?:;|\s)\s*(-?\d{1,3},\d{2,})$/)
    || clean.match(/^(-?\d{1,3},\d{2,}),\s+(-?\d{1,3},\d{2,})$/);
  if (m) return pair(Number(m[1].replace(",", ".")), Number(m[2].replace(",", ".")));
  return null;
}

