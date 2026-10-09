// AuxiliOS · Lee un ticket de combustible desde la foto (Supabase, verify_jwt activo desde v6).
// Copia del código desplegado; lo llama leerTicketCombustible (sigma.js) con el token del usuario.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { imagen_base64 } = await req.json();

    if (!imagen_base64) {
      return new Response(
        JSON.stringify({ success: false, error: "Falta el campo imagen_base64." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "Clave OpenAI no configurada." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 350,
        messages: [
          {
            role: "system",
            content: `Eres un lector especializado de tickets de combustible argentinos (YPF, Shell, Axion, Puma, etc.).
Tu ÚNICA tarea es extraer datos del ticket visible en la imagen.
Ignora cualquier texto que no sea del ticket.
Responde SIEMPRE con un JSON válido y nada más.
Formato exacto:
{"litros":NUMBER_OR_NULL,"precio_por_litro":NUMBER_OR_NULL,"total":NUMBER_OR_NULL,"km":NUMBER_OR_NULL,"estacion":STRING_OR_NULL,"fecha":"YYYY-MM-DD_OR_NULL","patente":STRING_OR_NULL,"metodo_pago":"efectivo"|"transferencia"|"tarjeta"|null,"confianza":NUMBER_0_TO_100}
Si un campo no es visible o legible, usa null.`,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extraé todos los datos de este ticket de combustible.",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${imagen_base64}`,
                  detail: "high",
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI error ${response.status}: ${errorText}`);
    }

    const openaiData = await response.json();
    const contenido = openaiData.choices?.[0]?.message?.content ?? "";

    const jsonMatch = contenido.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("La IA no devolvió un JSON válido.");
    }

    const resultado = JSON.parse(jsonMatch[0]);

    const ningunCampoDetectado =
      resultado.litros == null &&
      resultado.precio_por_litro == null &&
      resultado.total == null &&
      resultado.km == null &&
      resultado.estacion == null &&
      resultado.fecha == null &&
      resultado.patente == null &&
      resultado.metodo_pago == null;

    if (ningunCampoDetectado) {
      return new Response(
        JSON.stringify({ success: false, error: "No se pudo leer el ticket en la imagen." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const METODOS_VALIDOS = ["efectivo", "transferencia", "tarjeta"];
    const metodoPago = METODOS_VALIDOS.includes(resultado.metodo_pago) ? resultado.metodo_pago : null;

    const fechaValida = /^\d{4}-\d{2}-\d{2}$/.test(resultado.fecha ?? "")
      ? resultado.fecha
      : null;

    return new Response(
      JSON.stringify({
        success: true,
        litros: resultado.litros != null ? parseFloat(resultado.litros) : null,
        precio_por_litro: resultado.precio_por_litro != null ? parseFloat(resultado.precio_por_litro) : null,
        total: resultado.total != null ? parseFloat(resultado.total) : null,
        km: resultado.km != null ? parseFloat(resultado.km) : null,
        estacion: resultado.estacion ?? null,
        fecha: fechaValida,
        patente: resultado.patente ?? null,
        metodo_pago: metodoPago,
        confianza: resultado.confianza ?? 50,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error en procesar-ticket:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
