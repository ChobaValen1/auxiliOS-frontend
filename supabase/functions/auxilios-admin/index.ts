import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "https://auxilios-arg.vercel.app",
  "https://auxilios-frontend-auxili-os.vercel.app",
  "https://auxilios-frontend-git-main-auxili-os.vercel.app",
  "https://auxilios-frontend-git-feat-integrated-remito-flow-v1-auxili-os.vercel.app",
  "https://auxilios-frontend-git-agent-iso-security-foundation-auxili-os.vercel.app",
  "https://auxilios-frontend-git-claude-auxilios-3zj57q-auxili-os.vercel.app",
]);
const ROLE_NAMES = new Set(["administracion", "operador", "supervision", "chofer"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DNI_RE = /^\d{6,10}$/;
const USER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonRecord = Record<string, unknown>;

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin");
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin)
      ? origin
      : "https://auxilios-arg.vercel.app",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-request-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  };
}

function json(req: Request, status: number, body: JsonRecord) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(req) });
}

function cleanString(value: unknown, min: number, max: number) {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean.length >= min && clean.length <= max ? clean : null;
}

function bearerToken(req: Request) {
  const match = req.headers.get("authorization")?.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1] ?? null;
}

async function readJson(req: Request) {
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > 16_384) throw new Error("PAYLOAD_TOO_LARGE");
  return await req.json() as JsonRecord;
}

function roleName(profile: { roles?: unknown }) {
  if (Array.isArray(profile.roles)) {
    const first = profile.roles[0] as { name?: unknown } | undefined;
    return typeof first?.name === "string" ? first.name : "";
  }
  const joined = profile.roles as { name?: unknown } | null;
  return typeof joined?.name === "string" ? joined.name : "";
}

function endpoint(req: Request) {
  const pathname = new URL(req.url).pathname.replace(/\/+$/, "");
  if (pathname.endsWith("/api/create-user")) return "create-user";
  if (pathname.endsWith("/api/update-user")) return "update-user";
  if (pathname.endsWith("/api/send-password-reset")) return "password-reset";
  return "not-found";
}

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Faltan variables internas de Supabase");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

async function requireAdmin(req: Request) {
  const token = bearerToken(req);
  if (!token) return { error: json(req, 401, { error: "No autenticado" }) };

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) {
    return { error: json(req, 401, { error: "Sesión inválida o vencida" }) };
  }

  const { data: profile, error: profileError } = await admin
    .from("users")
    .select("user_id, role_id, is_active, roles(name)")
    .eq("user_id", authData.user.id)
    .single();
  if (profileError || !profile || profile.is_active === false) {
    return { error: json(req, 403, { error: "Usuario sin acceso habilitado" }) };
  }
  if (roleName(profile) !== "administracion") {
    return { error: json(req, 403, { error: "No autorizado" }) };
  }
  return { userId: authData.user.id };
}

async function createUser(req: Request, requestId: string) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const body = await readJson(req);
  const fullName = cleanString(body.full_name, 2, 120);
  const email = cleanString(body.email, 5, 254)?.toLowerCase() ?? null;
  const legajo = cleanString(body.legajo, 1, 40)?.toUpperCase() ?? null;
  const requestedRole = cleanString(body.role_name, 1, 40);
  const phone = body.phone == null || body.phone === ""
    ? null
    : cleanString(body.phone, 6, 30);
  const dni = body.dni == null || body.dni === ""
    ? null
    : cleanString(body.dni, 6, 10);

  if (
    !fullName || !email || !EMAIL_RE.test(email) || !legajo ||
    !requestedRole || !ROLE_NAMES.has(requestedRole) ||
    (body.phone && !phone) || (dni && !DNI_RE.test(dni))
  ) {
    return json(req, 400, { error: "Datos de usuario inválidos" });
  }

  const { data: role, error: roleError } = await admin
    .from("roles")
    .select("role_id")
    .eq("name", requestedRole)
    .single();
  if (roleError || !role?.role_id) {
    return json(req, 500, { error: "No se pudo validar el rol solicitado" });
  }

  const redirectTo = Deno.env.get("APP_PASSWORD_RESET_REDIRECT") ||
    "https://auxilios-arg.vercel.app";
  const { data: invitation, error: invitationError } =
    await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { full_name: fullName },
    });
  if (invitationError || !invitation.user) {
    console.warn(JSON.stringify({
      event: "user_invitation_failed",
      requestId,
      actorId: auth.userId,
      reason: invitationError?.message,
    }));
    return json(req, 400, { error: "No se pudo invitar al usuario" });
  }

  const userId = invitation.user.id;
  const { error: profileError } = await admin.from("users").insert({
    user_id: userId,
    role_id: role.role_id,
    legajo,
    email,
    full_name: fullName,
    phone,
    dni,
    password_hash: "SUPABASE_AUTH",
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(userId);
    console.error(JSON.stringify({
      event: "user_profile_create_failed",
      requestId,
      actorId: auth.userId,
      targetUserId: userId,
      reason: profileError.message,
    }));
    return json(req, 500, { error: "No se pudo completar el alta del usuario" });
  }

  console.info(JSON.stringify({
    event: "user_invited",
    requestId,
    actorId: auth.userId,
    targetUserId: userId,
    role: requestedRole,
  }));
  return json(req, 201, { ok: true, invitation_sent: true });
}

async function updateUser(req: Request, requestId: string) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const body = await readJson(req);
  const userId = cleanString(body.user_id, 36, 36);
  const fullName = cleanString(body.full_name, 2, 120);
  const email = cleanString(body.email, 5, 254)?.toLowerCase() ?? null;
  const requestedRole = cleanString(body.role_name, 1, 40);
  const phone = body.phone == null || body.phone === "" ? null : cleanString(body.phone, 6, 30);
  const dni = body.dni == null || body.dni === "" ? null : cleanString(body.dni, 6, 10);
  const licenseNumber = body.license_number == null || body.license_number === "" ? null : cleanString(body.license_number, 1, 60);
  const licenseExpiry = body.license_expiry == null || body.license_expiry === "" ? null : cleanString(body.license_expiry, 10, 10);

  if (!userId || !USER_ID_RE.test(userId) || !fullName || !email || !EMAIL_RE.test(email) ||
      !requestedRole || !ROLE_NAMES.has(requestedRole) || (body.phone && !phone) ||
      (dni && !DNI_RE.test(dni)) || (body.license_number && !licenseNumber) ||
      (licenseExpiry && !/^\d{4}-\d{2}-\d{2}$/.test(licenseExpiry))) {
    return json(req, 400, { error: "Datos de usuario inválidos" });
  }

  const [{ data: current, error: currentError }, { data: role, error: roleError }] = await Promise.all([
    admin.from("users").select("email").eq("user_id", userId).single(),
    admin.from("roles").select("role_id").eq("name", requestedRole).single(),
  ]);
  if (currentError || !current?.email) return json(req, 404, { error: "Usuario no encontrado" });
  if (roleError || !role?.role_id) return json(req, 400, { error: "Rol inválido" });

  const previousEmail = String(current.email).toLowerCase();
  if (email !== previousEmail) {
    const { error } = await admin.auth.admin.updateUserById(userId, { email, email_confirm: true });
    if (error) return json(req, 400, { error: error.message.includes("already") ? "El email ya está en uso" : "No se pudo actualizar el email de acceso" });
  }

  const { error: profileError } = await admin.from("users").update({
    full_name: fullName, email, phone, dni, role_id: role.role_id,
    license_number: licenseNumber, license_expiry: licenseExpiry,
  }).eq("user_id", userId);
  if (profileError) {
    if (email !== previousEmail) await admin.auth.admin.updateUserById(userId, { email: previousEmail, email_confirm: true });
    return json(req, 400, { error: profileError.code === "23505" ? "El email ya está en uso" : "No se pudo actualizar el usuario" });
  }

  console.info(JSON.stringify({ event: "user_updated", requestId, actorId: auth.userId, targetUserId: userId }));
  return json(req, 200, { ok: true });
}

async function sendPasswordReset(req: Request, requestId: string) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const body = await readJson(req);
  const userId = cleanString(body.userId, 36, 36);
  if (!userId || !USER_ID_RE.test(userId)) {
    return json(req, 400, { error: "Usuario inválido" });
  }

  const { data: profile, error: profileError } = await admin
    .from("users")
    .select("email")
    .eq("user_id", userId)
    .single();
  if (profileError || !profile?.email) {
    return json(req, 404, { error: "Usuario no encontrado" });
  }

  const redirectTo = Deno.env.get("APP_PASSWORD_RESET_REDIRECT") ||
    "https://auxilios-arg.vercel.app";
  const { data: recovery, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: profile.email,
    options: { redirectTo },
  });
  const actionLink = recovery?.properties?.action_link;
  if (error || !actionLink) {
    console.error(JSON.stringify({
      event: "password_reset_link_failed",
      requestId,
      actorId: auth.userId,
      targetUserId: userId,
      reason: error?.message || "missing_action_link",
    }));
    return json(req, 502, { error: "No se pudo generar el enlace de recuperación" });
  }

  console.info(JSON.stringify({
    event: "password_reset_requested",
    requestId,
    actorId: auth.userId,
    targetUserId: userId,
  }));
  return json(req, 200, { ok: true, action_link: actionLink });
}

Deno.serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  const origin = req.headers.get("origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return json(req, 403, { error: "Origen no permitido" });
  }
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") return json(req, 405, { error: "Método no permitido" });

  const route = endpoint(req);
  if (route === "not-found") return json(req, 404, { error: "Ruta no encontrada" });

  try {
    if (route === "create-user") return await createUser(req, requestId);
    if (route === "update-user") return await updateUser(req, requestId);
    return await sendPasswordReset(req, requestId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error(JSON.stringify({ event: "unhandled_request_error", requestId, message }));
    if (message === "PAYLOAD_TOO_LARGE") {
      return json(req, 413, { error: "La solicitud supera el límite permitido" });
    }
    return json(req, 500, { error: "Error interno del servidor" });
  }
});
