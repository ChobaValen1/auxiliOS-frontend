import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MARGEN_TOLERANCIA = 500;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const log_id = body?.log_id;
    const driver_id = body?.driver_id;
    const fecha = body?.fecha;
    const efectivo_declarado = body?.efectivo_declarado;
    const gastos_extra = body?.gastos_extra ?? 0;
    const motivo_gastos_extra = body?.motivo_gastos_extra ?? body?.motivo_extra ?? null;
    const notas_chofer = body?.notas_chofer ?? body?.notas ?? null;

    if (!log_id || !driver_id || !fecha || efectivo_declarado == null) {
      return new Response(
        JSON.stringify({ success: false, error: "Faltan campos requeridos: log_id, driver_id, fecha, efectivo_declarado." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!SUPABASE_SERVICE) {
      return new Response(
        JSON.stringify({ success: false, error: "Service key no configurada." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // verify_jwt permanece desactivado por compatibilidad histórica, pero el bearer
    // se valida explícitamente y el actor debe ser el dueño de la jornada.
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) {
      return new Response(
        JSON.stringify({ success: false, error: "Sesión requerida." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const { data: authData, error: authError } = await db.auth.getUser(token);
    const actorId = authData?.user?.id;
    if (authError || !actorId) {
      return new Response(
        JSON.stringify({ success: false, error: "Sesión inválida o vencida." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }
    if (actorId !== driver_id) {
      return new Response(
        JSON.stringify({ success: false, error: "La rendición solo puede registrarla el chofer de la jornada." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    const { data: jornada, error: jornadaError } = await db
      .from("daily_logs")
      .select("log_id, driver_id, log_date")
      .eq("log_id", log_id)
      .maybeSingle();

    if (jornadaError) throw new Error(`daily_logs: ${jornadaError.message}`);
    if (!jornada || jornada.driver_id !== driver_id || jornada.log_date !== fecha) {
      return new Response(
        JSON.stringify({ success: false, error: "La jornada no coincide con el chofer y la fecha informados." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const { data: efectivoData, error: e1 } = await db
      .rpc("calcular_efectivo_jornada", { p_log_id: log_id });
    if (e1) throw new Error(`calcular_efectivo_jornada: ${e1.message}`);
    const efectivo_esperado: number = Number(efectivoData ?? 0);

    const { data: gastosData, error: e2 } = await db
      .rpc("calcular_gastos_jornada", { p_log_id: log_id });
    if (e2) throw new Error(`calcular_gastos_jornada: ${e2.message}`);
    const gastos_sistema: number = Number(gastosData ?? 0);

    const { data: rendicion, error: e3 } = await db
      .from("rendicion_cierre")
      .insert({
        log_id,
        driver_id,
        fecha,
        efectivo_esperado,
        efectivo_declarado: Number(efectivo_declarado),
        gastos_sistema,
        gastos_extra: Number(gastos_extra) || 0,
        motivo_gastos_extra: motivo_gastos_extra || null,
        notas_chofer: notas_chofer || null,
        estado: "pendiente",
      })
      .select("rendicion_id, diferencia")
      .single();

    if (e3) throw new Error(`insert rendicion_cierre: ${e3.message}`);

    const diferencia: number = Number(rendicion.diferencia ?? 0);
    const hayAlerta = Math.abs(diferencia) > MARGEN_TOLERANCIA;

    if (hayAlerta) {
      const { error: e4 } = await db
        .from("alertas_operativas")
        .insert({
          rendicion_id: rendicion.rendicion_id,
          driver_id,
          fecha,
          tipo: "diferencia_efectivo",
          diferencia_monto: diferencia,
          nota_chofer: notas_chofer || null,
          estado: "pendiente",
        });
      if (e4) throw new Error(`insert alertas_operativas: ${e4.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        rendicion_id: rendicion.rendicion_id,
        efectivo_esperado,
        efectivo_declarado: Number(efectivo_declarado),
        gastos_sistema,
        diferencia,
        alerta_generada: hayAlerta,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error en check-integridad:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
