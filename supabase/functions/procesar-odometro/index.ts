import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Lee el tablero de la foto del odómetro con IA.
// · Siempre: el kilometraje TOTAL (km_extraido), como antes.
// · Si el camión registra horas de motor (leer_horas = true): también las
//   horas del horómetro (horas_extraidas), de la misma foto. Si la IA no las
//   ve, horas_extraidas viene null y el chofer las escribe a mano.
// Sin leer_horas la respuesta es idéntica a la versión anterior.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status });

function promptKm(kmReferencia: unknown) {
  return `Eres un sistema OCR experto en tableros de camiones.
Tu ÚNICA tarea es extraer el kilometraje TOTAL.
CONTEXTO VITAL: El último kilometraje registrado de este camión es ${kmReferencia} km. El número que busques debe ser lógico y coherente con esta cifra (igual o levemente superior).
IGNORA COMPLETAMENTE: Odómetros parciales (Trip A/B), temperatura, reloj, litros o RPM.
Debes responder ESTRICTAMENTE en formato JSON, sin texto adicional, con esta estructura exacta:
{
  "success": true,
  "km_extraido": (número entero, ej: 145678),
  "confianza": (número del 0 al 100)
}
Si la foto está completamente borrosa o no hay un tablero, devuelve success en false y km_extraido en null.`;
}

function promptKmYHoras(kmReferencia: unknown, horasReferencia: unknown) {
  return `Eres un sistema OCR experto en tableros de camiones y maquinaria.
Tienes DOS tareas sobre la misma foto del tablero:
1. Extraer el kilometraje TOTAL. El último registrado es ${kmReferencia} km: el número debe ser igual o levemente superior.
2. Extraer las HORAS DE MOTOR del horómetro (suele mostrarse con "h", "hrs", un ícono de reloj de arena o como "Engine hours"). ${horasReferencia ? `Las últimas registradas son ${horasReferencia} h: el número debe ser igual o levemente superior (pocas horas más).` : ''} Puede tener un decimal (ej: 1234.5).
IGNORA COMPLETAMENTE: odómetros parciales (Trip A/B), el reloj con la hora del día, temperatura, litros o RPM. No confundas la hora del día con las horas de motor.
Responde ESTRICTAMENTE en JSON, sin texto adicional:
{
  "success": true,
  "km_extraido": (número entero o null),
  "confianza": (0 a 100, sobre el kilometraje),
  "horas_extraidas": (número con hasta un decimal, o null si no se ven las horas de motor),
  "confianza_horas": (0 a 100)
}
Si la foto está borrosa o no hay tablero, devuelve success en false. Si se ve el kilometraje pero no las horas, devuelve horas_extraidas en null.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { url_foto, contexto, km_referencia, leer_horas, horas_referencia } = await req.json();
    if (!url_foto) return json({ success: false, error: "Falta la URL de la foto." }, 400);

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) return json({ success: false, error: "Clave OpenAI no configurada." }, 500);

    const conHoras = leer_horas === true;
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        max_tokens: conHoras ? 200 : 150,
        temperature: 0.1,
        messages: [
          { role: "system", content: conHoras ? promptKmYHoras(km_referencia, horas_referencia) : promptKm(km_referencia) },
          {
            role: "user",
            content: [
              { type: "text", text: conHoras ? "Extrae el kilometraje total y las horas de motor de este tablero." : "Extrae el kilometraje total de este tablero." },
              { type: "image_url", image_url: { url: url_foto, detail: "high" } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) throw new Error(`OpenAI error ${response.status}: ${await response.text()}`);

    const openaiData = await response.json();
    const resultado = JSON.parse(openaiData.choices?.[0]?.message?.content ?? "{}");

    if (!resultado.success || resultado.km_extraido === null || resultado.km_extraido === undefined) {
      return json({ success: false, error: "La IA no pudo encontrar un número de kilometraje válido en la foto." });
    }

    const salida: Record<string, unknown> = {
      success: true,
      km_extraido: parseInt(resultado.km_extraido),
      confianza: resultado.confianza ?? 95,
      contexto,
    };
    if (conHoras) {
      const h = Number(resultado.horas_extraidas);
      salida.horas_extraidas = resultado.horas_extraidas === null || !isFinite(h) || h < 0 ? null : Math.round(h * 10) / 10;
      salida.confianza_horas = resultado.confianza_horas ?? null;
    }
    return json(salida);
  } catch (error) {
    console.error("Error en procesar-odometro:", error);
    return json({ success: false, error: (error as Error).message }, 500);
  }
});
