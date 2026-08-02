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

const requireNumber = (value: unknown, label: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} inválido`);
  return parsed;
};

const parseDurationSeconds = (value: unknown): number => {
  const match = String(value ?? "").match(/^([0-9]+(?:\.[0-9]+)?)s$/);
  return match ? Math.round(Number(match[1])) : 0;
};

const latLngWaypoint = (point: Record<string, unknown>) => ({
  location: {
    latLng: {
      latitude: requireNumber(point.latitude, "Latitud"),
      longitude: requireNumber(point.longitude, "Longitud"),
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
    throw new Error(message);
  }
  return payload;
}

async function autocomplete(body: Record<string, any>, apiKey: string) {
  const input = String(body.input || "").trim();
  if (input.length < 3) return { suggestions: [] };

  const request: Record<string, unknown> = {
    input,
    sessionToken: body.sessionToken || undefined,
    regionCode: body.regionCode || "AR",
    languageCode: "es",
    includedRegionCodes: ["AR"],
  };
  const bias = body.locationBias;
  if (bias && Number.isFinite(Number(bias.latitude)) && Number.isFinite(Number(bias.longitude))) {
    request.locationBias = {
      circle: {
        center: {
          latitude: Number(bias.latitude),
          longitude: Number(bias.longitude),
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

  const suggestions = (payload.suggestions || [])
    .map((entry: any) => entry.placePrediction)
    .filter(Boolean)
    .slice(0, 6)
    .map((prediction: any) => ({
      placeId: prediction.placeId,
      text: prediction.text?.text || "",
      mainText: prediction.structuredFormat?.mainText?.text || prediction.text?.text || "",
      secondaryText: prediction.structuredFormat?.secondaryText?.text || "",
    }));
  return { suggestions };
}

async function placeDetails(body: Record<string, any>, apiKey: string) {
  const placeId = String(body.placeId || "").trim();
  if (!placeId) throw new Error("Falta el Place ID");
  const params = new URLSearchParams({ languageCode: "es", regionCode: "AR" });
  const payload = await googleFetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?${params}`,
    apiKey,
    { method: "GET" },
    "id,displayName,formattedAddress,location",
  );
  return {
    placeId: payload.id || placeId,
    displayName: payload.displayName?.text || "",
    formattedAddress: payload.formattedAddress || "",
    location: payload.location || null,
  };
}

async function computeRoute(body: Record<string, any>, apiKey: string) {
  const base = body.base || {};
  const origin = body.origin || {};
  const destination = body.destination || {};
  const request = {
    origin: latLngWaypoint(base),
    destination: latLngWaypoint(base),
    intermediates: [latLngWaypoint(origin), latLngWaypoint(destination)],
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_AWARE",
    departureTime: body.departureTime || new Date().toISOString(),
    languageCode: "es-419",
    regionCode: "AR",
    routeModifiers: {
      avoidTolls: false,
      vehicleInfo: { emissionType: body.emissionType || "DIESEL" },
      tollPasses: Array.isArray(body.tollPasses) && body.tollPasses.length
        ? body.tollPasses
        : ["AR_TELEPASE"],
    },
    extraComputations: ["TOLLS"],
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
      "routes.travelAdvisory.tollInfo",
    ].join(","),
  );
  const route = payload.routes?.[0];
  if (!route) throw new Error("Google Maps no encontró un recorrido");

  const estimatedPrices = route.travelAdvisory?.tollInfo?.estimatedPrice || [];
  const tollAmount = estimatedPrices.reduce((total: number, item: any) => {
    return total + Number(item.units || 0) + Number(item.nanos || 0) / 1_000_000_000;
  }, 0);
  const currencyCode = estimatedPrices.find((item: any) => item.currencyCode)?.currencyCode || null;
  const legs = (route.legs || []).map((leg: any, index: number) => ({
    index,
    distanceMeters: Number(leg.distanceMeters || 0),
    durationSeconds: parseDurationSeconds(leg.duration),
  }));

  return {
    distanceMeters: Number(route.distanceMeters || 0),
    durationSeconds: parseDurationSeconds(route.duration),
    legs,
    hasTolls: Boolean(route.travelAdvisory?.tollInfo),
    toll: estimatedPrices.length ? { amount: tollAmount, currencyCode } : null,
    provider: "google_routes",
  };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!apiKey) {
    return json({ error: "Google Maps todavía no está configurado en el servidor" }, 503);
  }

  try {
    const body = await request.json();
    const action = String(body?.action || "");
    if (action === "autocomplete") return json(await autocomplete(body, apiKey));
    if (action === "place") return json(await placeDetails(body, apiKey));
    if (action === "route") return json(await computeRoute(body, apiKey));
    return json({ error: "Acción inválida" }, 400);
  } catch (error) {
    console.error("[maps-proxy]", error);
    return json({ error: error instanceof Error ? error.message : "Error de Google Maps" }, 400);
  }
});
