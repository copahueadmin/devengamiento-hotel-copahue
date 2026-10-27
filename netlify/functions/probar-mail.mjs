// Función HTTP: prueba de envío de correo. La usa la ventana "Copias de seguridad" de la app, solo para giuliano.zolvini@hotelcopahue.com.
// Manda un único correo de prueba a la dirección que se escriba a mano y devuelve con qué servicio salió (Resend / Gmail) o el error exacto.

export const PROBADOR = "giuliano.zolvini@hotelcopahue.com";
const json = (c, o) => new Response(JSON.stringify(o), { status: c, headers: { "Content-Type": "application/json; charset=utf-8" } });
const RE_MAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/;

// Los módulos pesados (firebase-admin, nodemailer) se cargan acá adentro: si algo falla al cargarlos, la respuesta explica el motivo
// (en vez de un "502" mudo) y dice con qué versión de Node corre la función.
export default async (req) => {
  let c;
  try { c = await import("../lib/comun.mjs"); }
  catch (e) { console.error("probar-mail: no cargó comun.mjs", e); return json(500, { error: "No se pudieron cargar los módulos de la función: " + String((e && e.message) || e), node: process.version }); }
  return manejar(req, { transporte: c.crearTransporte, verificar: c.verificarToken, remitente: c.REMITENTE, util: { AVISO_AUTO: c.AVISO_AUTO, CABECERAS_AUTO: c.CABECERAS_AUTO, fechaHoraAR: c.fechaHoraAR } });
};

// deps: {transporte: () => transporte, verificar: (token) => claims, remitente: () => string, util: {AVISO_AUTO, CABECERAS_AUTO, fechaHoraAR}}  (inyectables para probar)
export async function manejar(req, deps) {
  if (req.method !== "POST") return json(405, { error: "Método no permitido." });
  let body; try { body = await req.json(); } catch (e) { return json(400, { error: "JSON inválido." }); }
  let actor;
  try { actor = await deps.verificar((req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "")); }
  catch (e) { return json(401, { error: "Sesión no válida." }); }
  if (String(actor.email || "").toLowerCase() !== PROBADOR) return json(403, { error: "No tenés permiso para hacer pruebas de envío." });
  const destino = String((body && body.destino) || "").trim();
  if (!RE_MAIL.test(destino)) return json(400, { error: "El correo de destino no es válido." });
  const { AVISO_AUTO, CABECERAS_AUTO, fechaHoraAR } = deps.util;
  const via = process.env.RESEND_API_KEY ? "Resend" : (process.env.GMAIL_USER ? "Gmail" : "sin configurar");
  const from = deps.remitente();
  try {
    const t = deps.transporte();
    const cuando = fechaHoraAR(new Date().toISOString());
    const r = await t.sendMail({
      from, to: destino, headers: CABECERAS_AUTO,
      subject: "PRUEBA de envío – Devengamiento Hotel Copahue",
      text: `Este es un correo de PRUEBA.\n\nSi lo estás leyendo, el envío de correos del sistema funciona.\nEnviado el ${cuando} (hora de Argentina) por ${actor.email}.\nServicio de envío: ${via}.\nRemitente: ${from}\n\n${AVISO_AUTO}`,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222"><p style="font-size:16px"><b>Correo de PRUEBA</b></p><p>Si lo estás leyendo, el envío de correos del sistema funciona.</p><p style="color:#555">Enviado el ${cuando} (hora de Argentina) por ${actor.email}.<br>Servicio de envío: ${via}.</p><hr style="border:none;border-top:1px solid #ccc"><p style="font-size:12px;color:#777">${AVISO_AUTO}</p></div>`,
    });
    return json(200, { ok: true, via, from, node: process.version, id: (r && r.messageId) || "" });
  } catch (e) {
    console.error("probar-mail:", e);
    return json(500, { error: String((e && e.message) || e), via, from, node: process.version });   // solo la ve quien hace la prueba (verificada arriba)
  }
}
