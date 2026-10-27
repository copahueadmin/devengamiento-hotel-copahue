// Función HTTP: la app la llama apenas alguien emite / modifica / elimina una OP, autoriza / rechaza / deshace, o escribe un mensaje.
// Pide el "ID token" de Firebase de quien está usando el sistema (Authorization: Bearer …), lo verifica, lee la orden de Firestore
// y manda el correo que corresponda. Nunca confía en el contenido: arma el correo con lo que figura en la base.
import { conectarFirestore, crearTransporte, verificarToken, FieldValue } from "../lib/comun.mjs";
import { AUTORIZADOR, mailEmitida, mailEliminada, mailDecision, mailDeshizo, mailMensaje, enviar, reclamar, soltar, estadoOrden } from "../lib/ordenes-mail.mjs";

const json = (c, o) => new Response(JSON.stringify(o), { status: c, headers: { "Content-Type": "application/json; charset=utf-8" } });

export default (req) => manejar(req, { db: conectarFirestore, transporte: crearTransporte, verificar: verificarToken, FieldValue });

// deps: {db: () => Firestore, transporte: () => transporte, verificar: (token) => claims, FieldValue}  (inyectables para probar)
export async function manejar(req, deps) {
  if (req.method !== "POST") return json(405, { error: "Método no permitido." });
  let body; try { body = await req.json(); } catch (e) { return json(400, { error: "JSON inválido." }); }
  const db = deps.db(), { FieldValue: FV } = deps;
  let actor;
  try {
    const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    actor = await deps.verificar(tok);
  } catch (e) { return json(401, { error: "Sesión no válida." }); }
  const email = String(actor.email || "").toLowerCase(), nombre = actor.name || email;
  const { tipo, ordenId } = body || {};
  try {
    const t = deps.transporte();
    if (tipo === "eliminada") {
      const r = body.resumen || {};   // la orden ya no existe: el resumen lo manda la app (solo totales)
      if (email === AUTORIZADOR) return json(403, { error: "Quien autoriza no elimina órdenes." });
      await enviar(t, mailEliminada({ id: String(r.id || ordenId || "OP"), emisorNombre: nombre, items: (r.items || []).map((i) => ({ metodo: String(i.metodo || ""), importe: +i.importe || 0, moneda: i.moneda === "USD" ? "USD" : "ARS" })) }));
      return json(200, { ok: true });
    }
    const snap = await db.collection("ordenes_pago").doc(String(ordenId || "")).get();
    if (!snap.exists) return json(404, { error: "La orden no existe." });
    const o = snap.data(), soyEmisor = (o.emisor.email || "").toLowerCase() === email, soyAut = email === AUTORIZADOR;
    if (!soyEmisor && !soyAut) return json(403, { error: "No participás de esta orden." });
    const est = estadoOrden(o);
    if (tipo === "creada" || tipo === "editada") {
      if (!soyEmisor) return json(403, { error: "Solo quien emitió la orden." });
      if (est === "programada") return json(200, { ok: true, omitido: "programada: se avisa al publicarse" });   // hasta su hora, José no se entera
      if (tipo === "creada") {
        if (!(await reclamar(db, o.id, "mailCreadaTs"))) return json(200, { ok: true, omitido: "ya avisada" });
        try { await enviar(t, mailEmitida(o, "creada")); } catch (e) { await soltar(db, o.id, "mailCreadaTs", FV); throw e; }
      } else {
        await enviar(t, mailEmitida(o, "editada"));
        if (!o.mailCreadaTs) await db.collection("ordenes_pago").doc(o.id).update({ mailCreadaTs: new Date().toISOString() });   // ya sabe de la orden
      }
    } else if (tipo === "decision") {
      if (!soyAut) return json(403, { error: "Solo quien autoriza." });
      const rowIds = Array.isArray(body.rowIds) ? body.rowIds.map(String) : [], accion = body.accion === "rech" ? "rech" : "aut";
      await enviar(t, mailDecision(o, nombre, rowIds, accion));
    } else if (tipo === "deshizo") {
      if (!soyAut) return json(403, { error: "Solo quien autoriza." });
      await enviar(t, mailDeshizo(o, nombre, String(body.rowId || "")));
    } else if (tipo === "mensaje") {
      const msg = (o.mensajes || []).find((m) => m.id === body.msgId);
      if (!msg || String(msg.autorEmail || "").toLowerCase() !== email) return json(404, { error: "Mensaje no encontrado." });
      await enviar(t, mailMensaje(o, msg, email));
    } else return json(400, { error: "Tipo de aviso desconocido." });
    return json(200, { ok: true });
  } catch (e) {
    console.error("notificar-op:", e);
    return json(500, { error: String((e && e.message) || e) });
  }
}
