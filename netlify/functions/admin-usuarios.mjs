// Función HTTP del panel "Administrar usuarios". Reemplaza al viejo usuario/clave de administrador que estaba escrito en el código.
// Quién es administrador se decide ACÁ, en el servidor: el correo de quien llama (sacado del ID token de Firebase, que se verifica)
// tiene que figurar en la variable de entorno ADMIN_EMAILS de Netlify (separados por coma). Nada de esto viaja al navegador.
// Las cuentas se crean / desactivan con Firebase Admin (la clave de servicio también vive solo en Netlify).
import { verificarToken, authAdmin } from "../lib/comun.mjs";

const json = (c, o) => new Response(JSON.stringify(o), { status: c, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

export const listaAdmins = () => String(process.env.ADMIN_EMAILS || "").split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);

export default (req) => manejar(req, { verificar: verificarToken, auth: authAdmin });

// deps: {verificar: (token) => claims, auth: () => Auth de Firebase Admin}  (inyectables para probar)
export async function manejar(req, deps) {
  if (req.method !== "POST") return json(405, { error: "Método no permitido." });
  let body; try { body = await req.json(); } catch (e) { return json(400, { error: "JSON inválido." }); }
  let actor;
  try {
    const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    actor = await deps.verificar(tok);
  } catch (e) { return json(401, { error: "Sesión no válida." }); }
  const email = String(actor.email || "").toLowerCase();
  const admins = listaAdmins();
  if (!admins.length) return json(403, { error: "Falta configurar ADMIN_EMAILS en Netlify (correos de los administradores, separados por coma)." });
  if (!email || !admins.includes(email)) return json(403, { error: "No tenés permiso de administrador." });

  const { accion } = body || {};
  try {
    if (accion === "verificar") return json(200, { ok: true, admin: true });

    if (accion === "crear") {
      const nombre = String(body.nombre || "").trim(), correo = String(body.email || "").trim().toLowerCase(), clave = String(body.clave || "");
      if (!nombre) return json(400, { error: "Falta el nombre y apellido." });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return json(400, { error: "El correo no es válido." });
      if (clave.length < 6) return json(400, { error: "La clave tiene que tener al menos 6 caracteres." });
      try {
        const u = await deps.auth().createUser({ email: correo, password: clave, displayName: nombre });
        console.log("admin-usuarios: " + email + " creó la cuenta " + correo);
        return json(200, { ok: true, uid: u.uid });
      } catch (e) {
        if (e && e.code === "auth/email-already-exists") return json(409, { error: "Ya existe una cuenta con ese correo." });
        if (e && (e.code === "auth/invalid-email" || e.code === "auth/invalid-password")) return json(400, { error: e.code === "auth/invalid-email" ? "El correo no es válido." : "La clave tiene que tener al menos 6 caracteres." });
        throw e;
      }
    }

    if (accion === "estado") {
      const correo = String(body.email || "").trim().toLowerCase();
      if (!correo || typeof body.activo !== "boolean") return json(400, { error: "Faltan datos." });
      const auth = deps.auth();
      let u;
      try { u = await auth.getUserByEmail(correo); }
      catch (e) { if (e && e.code === "auth/user-not-found") return json(404, { error: "La cuenta no existe en Firebase Authentication." }); throw e; }
      await auth.updateUser(u.uid, { disabled: !body.activo });
      if (!body.activo) await auth.revokeRefreshTokens(u.uid);   // corta las sesiones abiertas de esa cuenta
      console.log("admin-usuarios: " + email + (body.activo ? " reactivó " : " desactivó ") + correo);
      return json(200, { ok: true });
    }

    return json(400, { error: "Acción desconocida." });
  } catch (e) {
    console.error("admin-usuarios:", e);
    return json(500, { error: String((e && e.message) || e) });
  }
}
