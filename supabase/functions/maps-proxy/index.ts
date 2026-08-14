import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
});

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
    console.error("[maps-proxy:google]", {
      status: response.status,
      googleStatus: payload?.error?.status || null,
      message,
    });
    throw new Error(message);
  }
  return payload;
}

async function autocomplete(body: Record<string, any>, apiKey: string) {
  const input = String(body.input || "").trim();
  if (input.length < 3) return { suggestions: [] };
  if (input.length > 180) throw new Error("La búsqueda de dirección es demasiado larga");

  const request: Record<string, unknown> = {
    input,
    sessionToken: body.sessionToken || undefined,
    regionCode: "ar",
    languageCode: "es",
    includedRegionCodes: ["ar"],
  };
  const bias = body.locationBias;
  if (bias && Number.isFinite(Number(bias.latitude)) && Number.isFinite(Number(bias.longitude))) {
    request.locationBias = {
      circle: {
        center: {
          latitude: requireNumber(bias.latitude, "Latitud de referencia", -90, 90),
          longitude: requireNumber(bias.longitude, "Longitud de referencia", -180, 180),
        },
        radius: Math.min(Math.max(Number(bias.radius) || 50000, 1000), 500000),
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
  const params = new URLSearchParams({ languageCode: "es", regionCode: "ar" });
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
    return json({ error: error instanceof Error ? error.message : "Error de Google Maps" }, 400);
  }
});
