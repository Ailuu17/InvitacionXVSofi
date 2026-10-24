import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "Vary": "Origin",
});

const jsonResponse = (
  body: Record<string, unknown>,
  status: number,
  headers: Record<string, string>,
) => new Response(JSON.stringify(body), {
  status,
  headers: { ...headers, "Content-Type": "application/json" },
});

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
};

const defaultKey = (variable: string) => {
  const configuredKeys = Deno.env.get(variable);
  if (!configuredKeys) return "";

  try {
    const keys: unknown = JSON.parse(configuredKeys);
    if (keys && typeof keys === "object" && "default" in keys && typeof keys.default === "string") {
      return keys.default;
    }
  } catch (error) {
    console.error(`No se pudieron leer las claves configuradas en ${variable}:`, error);
  }
  return "";
};

const constantTimeEqual = async (left: string, right: string) => {
  const [leftHash, rightHash] = await Promise.all([sha256(left), sha256(right)]);
  let difference = 0;
  for (let index = 0; index < leftHash.length; index++) {
    difference |= leftHash.charCodeAt(index) ^ rightHash.charCodeAt(index);
  }
  return difference === 0;
};

Deno.serve(async (request) => {
  const allowedOrigin = Deno.env.get("ALBUM_ALLOWED_ORIGIN")?.trim() || "";
  const origin = request.headers.get("origin") || "";
  const originIsValid = origin === allowedOrigin && allowedOrigin.length > 0;
  const headers = corsHeaders(originIsValid ? allowedOrigin : "null");

  if (!originIsValid) {
    return jsonResponse({ error: "Origen no permitido." }, 403, headers);
  }
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Método no permitido." }, 405, headers);
  }

  const projectUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || defaultKey("SUPABASE_PUBLISHABLE_KEYS");
  const serviceRoleKey = Deno.env.get("ALBUM_SERVICE_ROLE_KEY")
    || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    || defaultKey("SUPABASE_SECRET_KEYS");
  const adminEmail = Deno.env.get("ALBUM_ADMIN_EMAIL");
  const adminPin = Deno.env.get("ALBUM_ADMIN_PIN");

  if (!projectUrl || !anonKey || !serviceRoleKey || !adminEmail || !adminPin || !/^\d{4}$/.test(adminPin)) {
    console.error("Falta configurar uno o más secretos del acceso por PIN.");
    return jsonResponse({ error: "El acceso seguro no está configurado." }, 500, headers);
  }

  let body: { pin?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Solicitud inválida." }, 400, headers);
  }
  if (typeof body.pin !== "string" || !/^\d{4}$/.test(body.pin)) {
    return jsonResponse({ error: "PIN inválido." }, 401, headers);
  }

  const clientIp = request.headers.get("cf-connecting-ip")?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!clientIp) {
    console.error("No se recibió una dirección IP para limitar intentos de acceso.");
    return jsonResponse({ error: "No se pudo validar el origen de la solicitud." }, 503, headers);
  }

  const adminClient = createClient(projectUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let attempts: number | null;
  try {
    const { data, error } = await adminClient.rpc(
      "consume_album_admin_pin_attempt",
      { p_ip_hash: await sha256(clientIp) },
    );
    if (error) throw error;
    attempts = data;
  } catch (error) {
    console.error("No se pudo consultar el límite de intentos del PIN:", error);
    return jsonResponse({ error: "No se pudo verificar el acceso ahora." }, 503, headers);
  }

  if (typeof attempts !== "number") {
    console.error("El control de intentos no devolvió un contador.");
    return jsonResponse({ error: "No se pudo verificar el acceso ahora." }, 503, headers);
  }
  if (attempts > 5) {
    return jsonResponse({ error: "Demasiados intentos. Esperá 15 minutos y volvé a probar." }, 429, headers);
  }
  if (!await constantTimeEqual(body.pin, adminPin)) {
    return jsonResponse({ error: "PIN inválido." }, 401, headers);
  }

  let linkData: {
    properties?: { hashed_token?: string } | null;
    user?: { id: string } | null;
  } | null = null;
  try {
    const { data, error } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: adminEmail,
    });
    if (error) throw error;
    linkData = data;
  } catch (error) {
    console.error("No se pudo crear una sesión para la cuenta administradora:", error);
    return jsonResponse({ error: "No se pudo iniciar la sesión administradora." }, 503, headers);
  }
  if (!linkData?.properties?.hashed_token || !linkData.user) {
    console.error("Supabase no devolvió un token de inicio de sesión válido.");
    return jsonResponse({ error: "No se pudo iniciar la sesión administradora." }, 503, headers);
  }

  let membership: { user_id: string } | null = null;
  try {
    const { data, error } = await adminClient
      .from("album_admins")
      .select("user_id")
      .eq("user_id", linkData.user.id)
      .maybeSingle();
    if (error) throw error;
    membership = data;
  } catch (error) {
    console.error("No se pudo verificar la membresía administradora:", error);
    return jsonResponse({ error: "No se pudo verificar la cuenta administradora." }, 503, headers);
  }
  if (!membership) {
    console.error("La cuenta configurada no está habilitada en album_admins.");
    return jsonResponse({ error: "La cuenta no está habilitada como administradora." }, 403, headers);
  }

  const authClient = createClient(projectUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let sessionData: {
    session: { access_token: string; refresh_token: string } | null;
  } | null = null;
  try {
    const { data, error } = await authClient.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: "email",
    });
    if (error) throw error;
    sessionData = data;
  } catch (error) {
    console.error("No se pudo verificar el enlace interno de sesión:", error);
    return jsonResponse({ error: "No se pudo iniciar la sesión administradora." }, 503, headers);
  }
  if (!sessionData.session) {
    console.error("Supabase no devolvió una sesión administradora.");
    return jsonResponse({ error: "No se pudo iniciar la sesión administradora." }, 503, headers);
  }

  return jsonResponse({
    access_token: sessionData.session.access_token,
    refresh_token: sessionData.session.refresh_token,
  }, 200, headers);
});
