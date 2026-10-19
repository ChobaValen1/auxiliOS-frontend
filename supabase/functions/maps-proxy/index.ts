import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { COORD_PREFIX, parseCoordinates } from "./coordinates.mjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
});

class GoogleMapsError extends Error {
  upstreamStatus: number;
  googleStatus: string | null;
  constructor(message: string, upstreamStatus: number, googleStatus: string | null = null) {
    super(message);
    this.name = "GoogleMapsError";
    this.upstreamStatus = upstreamStatus;
    this.googleStatus = googleStatus;
  }
}

const requireNumber = (value: unknown, label: string, min: number, max: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error(`${label} inválido`);
  return parsed;
};

const parseDurationSeconds = (value: unknown): number => {
  const match = String(value ?? "").match(/^([0-9]+(?:\.[0-9]+)?)s$/);
  return match ? Math.round(Number(match[1])) : 0;
};

const latLngWaypoint = (point: Record<string, unknown>) => ({
  location: {
    latLng: {
      latitude: requireNumber(point.latitude, "Latitud", -90, 90),
      longitude: requireNumber(point.longitude, "Longitud", -180, 180),
    },
  },
});

async function googleFetch(url: string, apiKey: string, init: RequestInit, fieldMask: string) {
  const headers = new Headers(init.headers || {});
  headers.set("X-Goog-Api-Key", apiKey);
  headers.set("X-Goog-FieldMask", fieldMask);
  headers.set("Content-Type", "application/json");
  const response = await fetch(url, { ...init, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `Google Maps respondió ${response.status}`;
    const googleStatus = payload?.error?.status || null;
    console.error("[maps-proxy:google]", {
      status: response.status,
      googleStatus,
      message,
    });
    throw new GoogleMapsError(message, response.status, googleStatus);
  }
  return payload;
}

// ── Coordenadas pegadas en lugar de una dirección ──────────────────────
// Acepta "-34.6037, -58.3816", "-34,6037; -58,3816", 34°36'13"S 58°22'53"W y enlaces de Google Maps.
const coordLabel = (c: { latitude: number; longitude: number }) => `${c.latitude.toFixed(6)}, ${c.longitude.toFixed(6)}`;

// Dirección más cercana a un punto (Geocoding API). Si Google no responde, se usan las coordenadas tal cual.
async function reverseGeocode(c: { latitude: number; longitude: number }, apiKey: string) {
  try {
    const params = new URLSearchParams({ latlng: `${c.latitude},${c.longitude}`, language: "es-419", region: "ar", key: apiKey });
    const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`);
    const payload = await response.json().catch(() => ({}));
    if (payload?.status !== "OK" || !Array.isArray(payload.results) || !payload.results.length) {
      console.warn("[maps-proxy:reverse]", { status: payload?.status || response.status, message: payload?.error_message || null });
      return null;
    }
    return payload.results.find((r: any) => !(r.types || []).includes("plus_code")) || payload.results[0];
  } catch (error) {
    console.warn("[maps-proxy:reverse]", error);
    return null;
  }
}

async function coordinateSuggestion(c: { latitude: number; longitude: number }, apiKey: string) {
  const geo = await reverseGeocode(c, apiKey), label = coordLabel(c), address = geo?.formatted_address || "";
  const [main, ...rest] = address.split(",");
  return {
    placeId: COORD_PREFIX + `${c.latitude},${c.longitude}`,
    text: address || label,
    mainText: address ? main.trim() : "Ubicación por coordenadas",
    secondaryText: address ? [rest.join(",").trim(), `Coordenadas ${label}`].filter(Boolean).join(" · ") : label,
    coordinates: c,
  };
}

async function coordinatePlace(c: { latitude: number; longitude: number }, apiKey: string) {
  const geo = await reverseGeocode(c, apiKey), label = coordLabel(c);
  // Mismo formato que Places para que todas las pantallas lo usen igual; la ubicación es el punto exacto pegado.
  const components = (Array.isArray(geo?.address_components) ? geo.address_components : [])
    .map((x: any) => ({ longText: x.long_name, shortText: x.short_name, types: x.types }));
  const street = component(components, ["route"]), streetNumber = component(components, ["street_number"]);
  const locality = component(components, ["locality", "postal_town", "administrative_area_level_2"]);
  const province = component(components, ["administrative_area_level_1"]), postalCode = component(components, ["postal_code"]), country = component(components, ["country"]);
  const formatted = geo?.formatted_address || label;
  return {
    placeId: geo?.place_id || COORD_PREFIX + `${c.latitude},${c.longitude}`,
    displayName: "",
    formattedAddress: formatted,
    address: [street.long, streetNumber.long].filter(Boolean).join(" ") || formatted,
    street: street.long, streetNumber: streetNumber.long, city: locality.long, locality: locality.long,
    province: province.long, postalCode: postalCode.long, country: country.long, countryCode: country.short,
    location: c,
    addressComponents: components,
    provider: geo ? "google_geocoding_reverse" : "coordinates",
    fromCoordinates: true,
  };
}

async function autocomplete(body: Record<string, any>, apiKey: string) {
  const input = String(body.input || "").trim();
  const coords = parseCoordinates(input);
  if (coords) return { suggestions: [await coordinateSuggestion(coords, apiKey)] };
  if (input.length < 3) return { suggestions: [] };
  if (input.length > 180) throw new Error("La búsqueda de dirección es demasiado larga");

  const request: Record<string, unknown> = {
    input,
    languageCode: "es-419",
    includedRegionCodes: ["ar"],
  };
  if (body.sessionToken) request.sessionToken = String(body.sessionToken);

  const bias = body.locationBias;
  if (bias && Number.isFinite(Number(bias.latitude)) && Number.isFinite(Number(bias.longitude))) {
    request.locationBias = {
      circle: {
        center: {
          latitude: requireNumber(bias.latitude, "Latitud de referencia", -90, 90),
          longitude: requireNumber(bias.longitude, "Longitud de referencia", -180, 180),
        },
        radius: Math.min(Math.max(Number(bias.radius) || 50000, 0), 50000),
      },
    };
  }

  const payload = await googleFetch(
    "https://places.googleapis.com/v1/places:autocomplete",
    apiKey,
    { method: "POST", body: JSON.stringify(request) },
    [
      "suggestions.placePrediction.placeId",
      "suggestions.placePrediction.text.text",
      "suggestions.placePrediction.structuredFormat.mainText.text",
      "suggestions.placePrediction.structuredFormat.secondaryText.text",
    ].join(","),
  );

  return {
    suggestions: (payload.suggestions || [])
      .map((entry: any) => entry.placePrediction)
      .filter(Boolean)
      .slice(0, 6)
      .map((prediction: any) => ({
        placeId: prediction.placeId,
        text: prediction.text?.text || "",
        mainText: prediction.structuredFormat?.mainText?.text || prediction.text?.text || "",
        secondaryText: prediction.structuredFormat?.secondaryText?.text || "",
      })),
  };
}

function component(components: any[], types: string[]) {
  for (const type of types) {
    const match = components.find((item: any) => Array.isArray(item.types) && item.types.includes(type));
    if (match) return { long: match.longText || match.shortText || null, short: match.shortText || match.longText || null };
  }
  return { long: null, short: null };
}

async function placeDetails(body: Record<string, any>, apiKey: string) {
  const placeId = String(body.placeId || "").trim();
  if (!placeId) throw new Error("Falta el Place ID");
  if (placeId.startsWith(COORD_PREFIX)) {
    const coords = parseCoordinates(placeId);
    if (!coords) throw new Error("Coordenadas inválidas");
    return coordinatePlace(coords, apiKey);
  }
  const params = new URLSearchParams({ languageCode: "es-419", regionCode: "ar" });
  if (body.sessionToken) params.set("sessionToken", String(body.sessionToken));

  const payload = await googleFetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?${params}`,
    apiKey,
    { method: "GET" },
    "id,displayName,formattedAddress,location,addressComponents",
  );
  const components = Array.isArray(payload.addressComponents) ? payload.addressComponents : [];
  const street = component(components, ["route"]);
  const streetNumber = component(components, ["street_number"]);
  const locality = component(components, ["locality", "postal_town", "administrative_area_level_2"]);
  const province = component(components, ["administrative_area_level_1"]);
  const postalCode = component(components, ["postal_code"]);
  const country = component(components, ["country"]);
  const streetAddress = [street.long, streetNumber.long].filter(Boolean).join(" ") || payload.formattedAddress || "";

  return {
    placeId: payload.id || placeId,
    displayName: payload.displayName?.text || "",
    formattedAddress: payload.formattedAddress || "",
    address: streetAddress,
    street: street.long,
    streetNumber: streetNumber.long,
    city: locality.long,
    locality: locality.long,
    province: province.long,
    postalCode: postalCode.long,
    country: country.long,
    countryCode: country.short,
    location: payload.location || null,
    addressComponents: components,
    provider: "google_places_new",
  };
}

type RouteMode = "base_origin_destination_base" | "base_origin" | "origin_destination";

function routeWaypoints(body: Record<string, any>) {
  const mode = String(body.routeMode || "base_origin_destination_base") as RouteMode;
  const base = body.base || {};
  const origin = body.origin || {};
  const destination = body.destination || {};

  if (mode === "base_origin") {
    return { mode, origin: latLngWaypoint(base), destination: latLngWaypoint(origin), intermediates: [] };
  }
  if (mode === "origin_destination") {
    return { mode, origin: latLngWaypoint(origin), destination: latLngWaypoint(destination), intermediates: [] };
  }
  if (mode !== "base_origin_destination_base") throw new Error("Modo de recorrido inválido");
  return {
    mode,
    origin: latLngWaypoint(base),
    destination: latLngWaypoint(base),
    intermediates: [latLngWaypoint(origin), latLngWaypoint(destination)],
  };
}

async function computeRoute(body: Record<string, any>, apiKey: string) {
  const waypoints = routeWaypoints(body);
  const request = {
    origin: waypoints.origin,
    destination: waypoints.destination,
    intermediates: waypoints.intermediates,
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_UNAWARE",
    languageCode: "es-419",
    regionCode: "ar",
  };

  const payload = await googleFetch(
    "https://routes.googleapis.com/directions/v2:computeRoutes",
    apiKey,
    { method: "POST", body: JSON.stringify(request) },
    [
      "routes.distanceMeters",
      "routes.duration",
      "routes.legs.distanceMeters",
      "routes.legs.duration",
      "routes.polyline.encodedPolyline",
    ].join(","),
  );
  const route = payload.routes?.[0];
  if (!route) throw new Error("Google Maps no encontró un recorrido");

  const legs = (route.legs || []).map((leg: any, index: number) => ({
    index,
    distanceMeters: Number(leg.distanceMeters || 0),
    durationSeconds: parseDurationSeconds(leg.duration),
  }));

  return {
    routeMode: waypoints.mode,
    distanceMeters: Number(route.distanceMeters || 0),
    durationSeconds: parseDurationSeconds(route.duration),
    legs,
    // Trazado completo del recorrido: el cliente lo cruza con la ubicación de los peajes.
    polyline: typeof route.polyline?.encodedPolyline === "string" ? route.polyline.encodedPolyline : null,
    provider: "google_routes",
    calculation: "billing_distance",
    hasTolls: null,
    toll: null,
  };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!apiKey) return json({ error: "Google Maps todavía no está configurado en el servidor" }, 503);

  try {
    const body = await request.json();
    const action = String(body?.action || "");
    if (action === "autocomplete") return json(await autocomplete(body, apiKey));
    if (action === "place") return json(await placeDetails(body, apiKey));
    if (action === "route") {
      if (body?.routeMode === "manual") return json({ error: "El kilometraje manual no usa cálculo automático" }, 400);
      return json(await computeRoute(body, apiKey));
    }
    return json({ error: "Acción inválida" }, 400);
  } catch (error) {
    console.error("[maps-proxy]", error);
    if (error instanceof GoogleMapsError) {
      return json({
        error: error.message,
        source: "google_maps",
        upstreamStatus: error.upstreamStatus,
        googleStatus: error.googleStatus,
      });
    }
    return json({ error: error instanceof Error ? error.message : "Error de Google Maps" }, 400);
  }
});
