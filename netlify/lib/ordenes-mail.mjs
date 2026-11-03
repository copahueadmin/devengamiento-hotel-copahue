// Avisos por correo de las órdenes de pago (OP).
//   · Administración emite / modifica / elimina una OP  → mail a quien autoriza (José), SOLO con totales (sin nombrar ítems).
//   · José autoriza / rechaza → UN mail resumen a administración (quien emitió la OP + giuliano.zolvini), con lo que quedó fuera si fue parcial.
//   · Preguntas y comentarios: se juntan en 1 minuto y sale un único mail a la otra parte, solo si no está en línea (ver cola más abajo).
//   · Modificar una OP o deshacer una decisión ya NO mandan correo.
//   · Una OP se vence → mail a las dos partes: si venció toda, la lista completa de ítems; si venció parcialmente, los ítems no aprobados.
// Los avisos de "emitida/modificada/decisión/mensaje" los dispara la app al momento (función notificar-op); la publicación de las OP
// programadas y los vencimientos los revisa la función programada avisos-op, aunque nadie tenga el sistema abierto.
import { REMITENTE, partesAR, fechaHoraAR, AVISO_AUTO, CABECERAS_AUTO } from "./comun.mjs";

export const AUTORIZADOR = (process.env.ORD_AUTORIZADOR || "jose.bazzani@hotelcopahue.com").toLowerCase();
export const ADMIN_FIJO = (process.env.ORD_ADMIN || "giuliano.zolvini@hotelcopahue.com").toLowerCase();
const RE_ULTIMAS_HORAS = 48 * 3600 * 1000;   // los avisos "atrasados" solo se mandan para órdenes de las últimas 48 hs (no se re-avisa el historial)

// ───────── utilidades ─────────
const esc = (t) => String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const num = (n) => Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 2 });
export const monto = (n, mon) => (mon === "USD" ? "U$S " : "$ ") + num(n);
export function totalesPorMoneda(items) { const t = {}; (items || []).forEach((i) => { const m = i.moneda || "ARS"; t[m] = (t[m] || 0) + (+i.importe || 0); }); return t; }
export function totalTxt(t) { const k = Object.keys(t).sort(); return k.length ? k.map((m) => monto(t[m], m)).join(" + ") : "—"; }
export function totalesPorMetodo(items) {
  const g = {}; (items || []).forEach((i) => { const k = i.metodo || ""; (g[k] = g[k] || []).push(i); });
  return Object.keys(g).sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b, "es"))).map((k) => ({ metodo: k || "Sin método de pago definido", total: totalTxt(totalesPorMoneda(g[k])) }));
}
const activos = (o) => (o.items || []).filter((i) => !i.rech);
const nAut = (o) => (o.items || []).filter((i) => i.aut).length;
const nRech = (o) => (o.items || []).filter((i) => i.rech).length;
const pendientes = (o) => (o.items || []).filter((i) => !i.aut && !i.rech);
export const unicos = (a) => [...new Set(a.filter(Boolean).map((x) => String(x).toLowerCase()))];
export const destinoAdmin = (o) => unicos([o.emisor && o.emisor.email, ADMIN_FIJO]);

// Fin del día (23:59:59.999 hora de Argentina) del día en que se emitió/publicó la orden
export function finDelDiaAR(iso) { const f = partesAR(new Date(iso)); return Date.parse(`${f.year}-${f.month}-${f.day}T23:59:59.999-03:00`); }
// Estado según las mismas reglas que la app
export function estadoOrden(o, ahora = Date.now()) {
  const items = o.items || [], n = items.length, a = nAut(o), r = nRech(o);
  if ((n && a === n) || (o.estado === "autorizada" && !r)) return "autorizada";
  if (n && a + r === n) return r === n ? "rechazada" : "resuelta";
  if (Date.parse(o.emitidaTs) > ahora) return "programada";
  if (ahora > finDelDiaAR(o.emitidaTs)) return "vencida";
  return a + r ? "parcial" : "pendiente";
}

// ───────── plantilla ─────────
function html(titulo, bloques) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1b1b1b;max-width:620px">
<div style="background:#16231f;color:#fff;padding:12px 16px;font-size:15px;font-weight:bold">${esc(titulo)}</div>
<div style="border:1px solid #d8d2c4;border-top:none;padding:14px 16px">${bloques.join("")}
<p style="color:#555;font-size:12px;margin:18px 0 0;padding-top:10px;border-top:1px solid #e4dfd2"><b>Correo automático — no responder.</b> ${esc(AVISO_AUTO)}<br>Sistema Resultados y Devengamiento — Hotel Copahue.</p></div></div>`;
}
const p = (t) => `<p style="margin:0 0 10px">${t}</p>`;
function tabla(filas, cab) {
  return `<table style="border-collapse:collapse;width:100%;margin:6px 0 12px">${cab ? `<tr>${cab.map((c, i) => `<th style="text-align:${i ? "right" : "left"};font-size:12px;color:#666;padding:4px 8px;border-bottom:2px solid #16231f">${esc(c)}</th>`).join("")}</tr>` : ""}${filas.map((f) => `<tr>${f.map((c, i) => `<td style="padding:5px 8px;border-bottom:1px solid #e4dfd2;text-align:${i ? "right" : "left"}">${esc(c)}</td>`).join("")}</tr>`).join("")}</table>`;
}
function totalesBloque(items) {
  const metodos = totalesPorMetodo(items);
  return p(`<b>Total de la orden: ${esc(totalTxt(totalesPorMoneda(items)))}</b>`) + tabla(metodos.map((m) => [m.metodo, m.total]), ["Método de pago", "Total"]);
}
function textoDe(titulo, partes) { return [titulo, "", ...partes, "", "—", "CORREO AUTOMÁTICO — NO RESPONDER.", AVISO_AUTO].join("\n"); }
const lineasMetodos = (items) => totalesPorMetodo(items).map((m) => `  · ${m.metodo}: ${m.total}`);
const listaItems = (items) => (items || []).map((i) => [i.item || "(sin nombre)", monto(i.importe, i.moneda) + (i.metodo ? " · " + i.metodo : "")]);

// ───────── armado de cada mail: devuelven {to, subject, text, html} ─────────
export function mailEmitida(o, tipo) {   // tipo: 'creada' | 'editada'
  const nom = o.emisor.nombre || o.emisor.email, it = activos(o), tot = totalTxt(totalesPorMoneda(it));
  const titulo = tipo === "editada" ? `${o.id} fue modificada` : `Nueva orden de pago ${o.id}`;
  const quien = tipo === "editada" ? `${nom} modificó la orden ${o.id}.` : `${nom} emitió la orden ${o.id} (${fechaHoraAR(o.emitidaTs)} hs).`;
  const vence = "Vence hoy a las 23:59 hs si no se autoriza por completo.";
  return {
    to: [AUTORIZADOR],
    subject: `${tipo === "editada" ? "OP modificada" : "Nueva OP"} ${o.id} — pendiente de tu autorización — Total ${tot}`,
    text: textoDe(titulo, [quien, vence, "", `Total de la orden: ${tot}`, "Total por método de pago:", ...lineasMetodos(it)]),
    html: html(titulo, [p(esc(quien)), p(esc(vence)), totalesBloque(it)]),
  };
}
export function mailEliminada(r) {   // r: {id, emisorNombre, items:[{metodo,importe,moneda}]}
  const tot = totalTxt(totalesPorMoneda(r.items));
  const titulo = `${r.id} fue eliminada`, quien = `${r.emisorNombre || "Administración"} eliminó la orden ${r.id}. Ya no hay nada para autorizar en ella.`;
  return { to: [AUTORIZADOR], subject: `OP eliminada ${r.id}`, text: textoDe(titulo, [quien, "", `Total que tenía: ${tot}`, "Total por método de pago:", ...lineasMetodos(r.items)]), html: html(titulo, [p(esc(quien)), totalesBloque(r.items)]) };
}
function estadoResumen(o) {
  const est = estadoOrden(o), n = (o.items || []).length;
  if (est === "autorizada") return "La orden quedó autorizada por completo.";
  if (est === "rechazada") return "Se rechazaron todos los movimientos de la orden.";
  if (est === "resuelta") return `La orden quedó resuelta: ${nAut(o)} autorizados y ${nRech(o)} rechazados.`;
  return `Resueltos ${nAut(o) + nRech(o)} de ${n} movimientos (${nAut(o)} autorizados, ${nRech(o)} rechazados); faltan ${pendientes(o).length}.`;
}
export function mailDecision(o, actorNombre, rowIds, accion) {   // accion: 'aut' | 'rech'
  const its = (o.items || []).filter((i) => rowIds.includes(i.rowId) && (accion === "aut" ? i.aut : i.rech));
  const verbo = accion === "aut" ? "autorizó" : "rechazó", n = its.length;
  const titulo = `${o.id}: ${actorNombre} ${verbo} ${n} movimiento${n === 1 ? "" : "s"}`;
  const resumen = estadoResumen(o);
  return {
    to: destinoAdmin(o), subject: titulo,
    text: textoDe(titulo, [`${actorNombre} ${verbo} en la orden ${o.id}:`, ...its.map((i) => `  · ${i.item} — ${monto(i.importe, i.moneda)}${i.metodo ? " (" + i.metodo + ")" : ""}`), "", resumen]),
    html: html(titulo, [p(`${esc(actorNombre)} <b>${verbo}</b> en la orden ${esc(o.id)}:`), tabla(listaItems(its), ["Movimiento", "Importe"]), p(esc(resumen))]),
  };
}
export function mailDeshizo(o, actorNombre, rowId) {
  const i = (o.items || []).find((x) => x.rowId === rowId), nombre = i ? i.item : "un movimiento";
  const titulo = `${o.id}: ${actorNombre} deshizo una decisión`, linea = `${actorNombre} deshizo su decisión sobre "${nombre}" en la orden ${o.id}: vuelve a estar pendiente.`;
  return { to: destinoAdmin(o), subject: titulo, text: textoDe(titulo, [linea, "", estadoResumen(o)]), html: html(titulo, [p(esc(linea)), p(esc(estadoResumen(o)))]) };
}
export function mailMensaje(o, msg, actorEmail) {
  const deAutorizador = actorEmail === AUTORIZADOR, aAdmin = deAutorizador;
  const to = aAdmin ? destinoAdmin(o) : [AUTORIZADOR];
  const it = msg.rowId ? (o.items || []).find((x) => x.rowId === msg.rowId) : null;
  // a quien autoriza no se le nombran ítems: se indica solo que es sobre un movimiento
  const sobre = msg.rowId ? (aAdmin ? ` sobre "${it ? it.item : "un movimiento"}"` : " sobre un movimiento") : "";
  const titulo = msg.rowId ? `${o.id}: nueva pregunta o comentario de ${msg.autorNombre}` : `${o.id}: nuevo comentario general de ${msg.autorNombre}`;
  const intro = `${msg.autorNombre} escribió${sobre} en la orden ${o.id} (${fechaHoraAR(msg.ts)} hs):`;
  return {
    to, subject: titulo, text: textoDe(titulo, [intro, "", `“${msg.texto}”`, "", "Entrá al sistema (Órdenes de pago) para responder."]),
    html: html(titulo, [p(esc(intro)), `<blockquote style="margin:6px 0 12px;padding:8px 12px;border-left:4px solid #b8791f;background:#f6f2e8">${esc(msg.texto).replace(/\n/g, "<br>")}</blockquote>`, p("Entrá al sistema (Órdenes de pago) para responder.")]),
  };
}

// Aprobación / rechazo: UN solo correo que resume cómo quedó la orden (lo autorizado y, si no se aprobó todo, qué quedó fuera).
export function mailAprobacion(o, ahora = Date.now()) {
  const todos = o.items || [], aut = todos.filter((i) => i.aut), rech = todos.filter((i) => i.rech), pend = pendientes(o);
  const quien = (aut.concat(rech).map((i) => (i.aut || i.rech).por && (i.aut || i.rech).por.nombre).filter(Boolean).pop()) || "Quien autoriza";
  const vencida = estadoOrden(o, ahora) === "vencida";
  let titulo, intro;
  if (aut.length && !rech.length && !pend.length) { titulo = `${o.id} fue autorizada por completo`; intro = `${quien} autorizó todos los movimientos de la orden ${o.id}.`; }
  else if (!aut.length && !pend.length) { titulo = `${o.id} fue rechazada por completo`; intro = `${quien} rechazó todos los movimientos de la orden ${o.id}.`; }
  else if (aut.length) { titulo = `${o.id} fue autorizada parcialmente`; intro = `${quien} autorizó ${aut.length} de ${todos.length} movimientos de la orden ${o.id}. El resto quedó fuera de esta autorización.`; }
  else { titulo = `${o.id}: ${quien} rechazó ${rech.length} movimiento${rech.length === 1 ? "" : "s"}`; intro = `${quien} resolvió parte de la orden ${o.id}: no autorizó ningún movimiento hasta ahora.`; }
  const bl = [p(esc(intro))], tx = [intro, ""];
  const seccion = (nombre, lista, extra) => {
    if (!lista.length) return;
    bl.push(p(`<b>${esc(nombre)} (${lista.length}) — ${esc(totalTxt(totalesPorMoneda(lista)))}</b>`), tabla(listaItems(lista), ["Movimiento", "Importe"]));
    tx.push(`${nombre} (${lista.length}) — ${totalTxt(totalesPorMoneda(lista))}:`, ...lista.map((i) => `  · ${i.item || "(sin nombre)"} — ${monto(i.importe, i.moneda)}${i.metodo ? " (" + i.metodo + ")" : ""}`), "");
    if (extra) { bl.push(p(esc(extra))); tx.push(extra, ""); }
  };
  seccion("Autorizados", aut);
  seccion("Rechazados — quedaron fuera", rech);
  seccion("Sin resolver — quedaron fuera por ahora", pend, vencida ? "Se venció la orden: estos movimientos quedaron libres para incluirlos en otra." : "Todavía se pueden resolver hasta las 23:59 hs del día de la orden.");
  if (aut.length) {
    const m = totalesPorMetodo(aut);
    bl.push(p("<b>Total autorizado por método de pago</b>"), tabla(m.map((x) => [x.metodo, x.total]), ["Método de pago", "Total"]));
    tx.push("Total autorizado por método de pago:", ...m.map((x) => `  · ${x.metodo}: ${x.total}`));
  }
  return { to: destinoAdmin(o), subject: titulo, text: textoDe(titulo, tx), html: html(titulo, bl) };
}

// Comentarios/preguntas acumulados: UN correo para quien no estaba en línea. A quien autoriza no se le nombran ítems.
export function mailMensajes(o, msgs, destino) {
  const aAdmin = destino !== AUTORIZADOR, n = msgs.length;
  const lista = msgs.slice().sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  const autores = [...new Set(lista.map((m) => m.autorNombre || m.autorEmail))];
  const titulo = n === 1 ? `${o.id}: nuevo ${lista[0].rowId ? "comentario o pregunta" : "comentario general"} de ${autores[0]}` : `${o.id}: ${n} novedades en la conversación (${autores.join(" y ")})`;
  const sobre = (m) => (m.rowId ? (aAdmin ? `sobre "${((o.items || []).find((x) => x.rowId === m.rowId) || {}).item || "un movimiento"}"` : "sobre un movimiento") : "comentario general");
  const intro = n === 1 ? `Tenés un mensaje nuevo en la orden ${o.id}:` : `Tenés ${n} mensajes nuevos en la orden ${o.id}:`;
  const pie = "Entrá al sistema (Órdenes de pago) para responder.";
  const tx = [intro, "", ...lista.flatMap((m) => [`[${fechaHoraAR(m.ts)} hs] ${m.autorNombre || m.autorEmail} — ${sobre(m)}:`, `  “${m.texto}”`, ""]), pie];
  const bl = [p(esc(intro)), ...lista.map((m) => `<p style="margin:10px 0 2px;font-size:12px;color:#555">${esc(fechaHoraAR(m.ts))} hs · <b>${esc(m.autorNombre || m.autorEmail)}</b> · ${esc(sobre(m))}</p><blockquote style="margin:2px 0 8px;padding:8px 12px;border-left:4px solid #b8791f;background:#f6f2e8">${esc(m.texto).replace(/\n/g, "<br>")}</blockquote>`), p(esc(pie))];
  return { to: [destino], subject: titulo, text: textoDe(titulo, tx), html: html(titulo, bl) };
}

export function mailVencida(o) {
  const total = nAut(o) + nRech(o) === 0, pend = pendientes(o), todos = o.items || [];
  const lista = total ? todos : pend;
  const titulo = total ? `${o.id} se venció` : `${o.id} se venció parcialmente`;
  const intro = total
    ? `La orden de pago ${o.id} (emitida el ${fechaHoraAR(o.emitidaTs)} hs) se venció sin que se aprobara ningún movimiento. Ítems que estaban dentro:`
    : `La orden de pago ${o.id} (emitida el ${fechaHoraAR(o.emitidaTs)} hs) se venció parcialmente: ${nAut(o)} movimientos autorizados${nRech(o) ? `, ${nRech(o)} rechazados` : ""} y ${pend.length} sin aprobar antes del vencimiento. Ítems NO aprobados:`;
  const pie = "Los movimientos sin autorizar quedaron libres para incluirlos en otra orden.";
  return {
    to: unicos([AUTORIZADOR, ...destinoAdmin(o)]), subject: titulo,
    text: textoDe(titulo, [intro, ...lista.map((i) => `  · ${i.item} — ${monto(i.importe, i.moneda)}${i.metodo ? " (" + i.metodo + ")" : ""}`), "", `Total no aprobado: ${totalTxt(totalesPorMoneda(lista))}`, pie]),
    html: html(titulo, [p(esc(intro)), tabla(listaItems(lista), ["Movimiento", "Importe"]), p(`<b>Total no aprobado: ${esc(totalTxt(totalesPorMoneda(lista)))}</b>`), p(esc(pie))]),
  };
}

// ───────── envío con "reclamo" para no duplicar ─────────
export async function enviar(transporte, m) {
  return transporte.sendMail({ from: REMITENTE(), to: m.to.join(", "), subject: m.subject, text: m.text, html: m.html, headers: CABECERAS_AUTO });
}
// Marca un campo en la orden solo si todavía no estaba (transacción): quien lo logra es el único que manda el aviso.
export async function reclamar(db, id, campo) {
  const ref = db.collection("ordenes_pago").doc(id);
  return db.runTransaction(async (tx) => {
    const s = await tx.get(ref); if (!s.exists || s.data()[campo]) return false;
    tx.update(ref, { [campo]: new Date().toISOString() }); return true;
  });
}
export async function soltar(db, id, campo, FieldValue) { try { await db.collection("ordenes_pago").doc(id).update({ [campo]: FieldValue.delete() }); } catch (e) { /* */ } }


// ───────── cola de avisos con demora (comentarios y decisiones) ─────────
// Los avisos de comentarios y de autorización/rechazo no salen en el momento: quedan en la colección "ordenes_cola" y los despacha
// la función programada cola-op (cada minuto), aunque nadie tenga el sistema abierto.
//   · Comentarios: se juntan todos los de la misma orden para cada destinatario; pasado 1 minuto desde el primero sale UN solo correo,
//     y solo si esa persona NO está en línea (colección "presencia"). Si está conectada se espera a que cierre la sesión; si ya leyó
//     los mensajes dentro del sistema, no se manda nada.
//   · Autorización / rechazo: un solo correo con el resumen de la orden. Sale al instante si ya no queda nada pendiente; si José dejó
//     movimientos sin resolver, sale 1 minuto después de su última decisión (con el detalle de lo que quedó fuera). Siempre se envía.
export const DEMORA_COLA_MS = 60 * 1000;
const PRESENCIA_VIGENTE_MS = 70 * 1000;      // la app marca presencia cada 20 s; con >70 s sin latido se considera cerrada
const CADUCA_COLA_MS = 48 * 3600 * 1000;
const COLA = "ordenes_cola";
export const claveUsuario = (e) => String(e || "").toLowerCase().replace(/[^a-z0-9]/g, "_");
const idSeguro = (t) => String(t).replace(/[^A-Za-z0-9_-]/g, "_");

export async function encolarMensaje(db, o, msg, ahora = Date.now()) {
  const autor = String(msg.autorEmail || "").toLowerCase();
  const destinos = (autor === AUTORIZADOR ? destinoAdmin(o) : [AUTORIZADOR]).filter((d) => d !== autor);
  for (const to of destinos)
    await db.collection(COLA).doc(idSeguro(`m__${o.id}__${claveUsuario(to)}__${msg.id}`)).set({ tipo: "mensaje", ordenId: o.id, msgId: msg.id, to, ts: ahora, estado: "pendiente" });
  return destinos;
}
export async function encolarDecision(db, o, ahora = Date.now()) {
  await db.collection(COLA).doc(idSeguro(`d__${o.id}`)).set({ tipo: "decision", ordenId: o.id, ts: ahora, estado: "pendiente" });
}
async function tomar(db, ref) {
  return db.runTransaction(async (tx) => {
    const s = await tx.get(ref); if (!s.exists || s.data().estado !== "pendiente") return false;
    tx.update(ref, { estado: "enviando" }); return true;
  });
}
const marcar = (ref, estado) => ref.update({ estado, tsFin: Date.now() });
const liberar = (ref) => ref.update({ estado: "pendiente" }).catch(() => {});
function leido(o, email, m) {
  const k = claveUsuario(email);
  const l = m.rowId ? ((o.leidoI || {})[k + "__" + claveUsuario(m.rowId)] || "") : ((o.leidoG || {})[k] || "");
  return !!l && String(m.ts) <= String(l);
}

// Envía el resumen de aprobación/rechazo de una orden si corresponde. Devuelve true si salió el correo.
export async function despacharDecision(db, transporte, ref, ahora = Date.now(), { forzarSiResuelta = false } = {}) {
  const ev = (await ref.get()).data(); if (!ev || ev.estado !== "pendiente") return false;
  const snap = await db.collection("ordenes_pago").doc(ev.ordenId).get();
  if (!snap.exists) { await marcar(ref, "omitido"); return false; }
  const o = snap.data(), resuelta = pendientes(o).length === 0;
  if (!(resuelta || ahora - ev.ts >= DEMORA_COLA_MS)) return false;
  if (!(await tomar(db, ref))) return false;
  try { await enviar(transporte, mailAprobacion(o, ahora)); await marcar(ref, "enviado"); return true; }
  catch (e) { await liberar(ref); throw e; }
}

export async function procesarCola({ db, transporte, ahora = Date.now() }) {
  const snap = await db.collection(COLA).where("estado", "==", "pendiente").get(), hechos = [], errores = [];
  if (snap.empty) return { hechos, errores };
  const decisiones = [], grupos = {};
  for (const d of snap.docs) {
    const ev = d.data();
    if (ahora - ev.ts > CADUCA_COLA_MS) { await marcar(d.ref, "omitido"); continue; }
    if (ev.tipo === "decision") decisiones.push(d);
    else if (ev.tipo === "mensaje") (grupos[ev.ordenId + "|" + ev.to] = grupos[ev.ordenId + "|" + ev.to] || []).push(d);
  }
  for (const d of decisiones) {
    try { if (await despacharDecision(db, transporte, d.ref, ahora)) hechos.push("decision:" + d.data().ordenId); }
    catch (e) { errores.push("decision:" + d.data().ordenId + ": " + (e && e.message)); }
  }
  const claves = Object.keys(grupos);
  if (claves.length) {
    const pres = await db.collection("presencia").get();
    const enLinea = new Set(); pres.forEach((x) => { const v = x.data() || {}; if (v.email && ahora - (+v.ts || 0) <= PRESENCIA_VIGENTE_MS) enLinea.add(String(v.email).toLowerCase()); });
    for (const k of claves) {
      const docs = grupos[k], ev0 = docs[0].data(), to = ev0.to;
      if (ahora - Math.min(...docs.map((x) => x.data().ts)) < DEMORA_COLA_MS) continue;   // todavía dentro del minuto de espera
      if (enLinea.has(String(to).toLowerCase())) continue;                                   // está conectado: se espera a que cierre sesión
      const tomados = []; for (const d of docs) if (await tomar(db, d.ref)) tomados.push(d);
      if (!tomados.length) continue;
      try {
        const os = await db.collection("ordenes_pago").doc(ev0.ordenId).get();
        const o = os.exists ? os.data() : null;
        const msgs = o ? tomados.map((d) => (o.mensajes || []).find((m) => m.id === d.data().msgId)).filter((m) => m && String(m.autorEmail || "").toLowerCase() !== String(to).toLowerCase() && !leido(o, to, m)) : [];
        if (!msgs.length) { for (const d of tomados) await marcar(d.ref, "omitido"); continue; }
        await enviar(transporte, mailMensajes(o, msgs, to));
        for (const d of tomados) await marcar(d.ref, "enviado");
        hechos.push(`mensajes:${ev0.ordenId}->${to}(${msgs.length})`);
      } catch (e) { for (const d of tomados) await liberar(d.ref); errores.push("mensajes:" + k + ": " + (e && e.message)); }
    }
  }
  return { hechos, errores };
}

// Revisión periódica (función programada): publica avisos pendientes de OP programadas y vencimientos
export async function revisarOrdenes({ db, transporte, FieldValue, ahora = Date.now() }) {
  const snap = await db.collection("ordenes_pago").get(), hechos = [];
  for (const d of snap.docs) {
    const o = d.data(); if (!o || !o.id) continue;
    const est = estadoOrden(o, ahora);
    // 1) orden publicada (inmediata no avisada, o programada que llegó a su hora) y todavía abierta: aviso a quien autoriza
    if (["pendiente", "parcial"].includes(est) && !o.mailCreadaTs && ahora - Date.parse(o.emitidaTs) < RE_ULTIMAS_HORAS) {
      if (await reclamar(db, o.id, "mailCreadaTs")) {
        try { await enviar(transporte, mailEmitida(o, "creada")); hechos.push(o.id + ":creada"); }
        catch (e) { await soltar(db, o.id, "mailCreadaTs", FieldValue); throw e; }
      }
    }
    // 2) vencimiento (total o parcial), hasta 48 hs después
    if (est === "vencida" && !o.mailVencidaTs && ahora - finDelDiaAR(o.emitidaTs) < RE_ULTIMAS_HORAS) {
      if (await reclamar(db, o.id, "mailVencidaTs")) {
        try { await enviar(transporte, mailVencida(o)); hechos.push(o.id + ":vencida"); }
        catch (e) { await soltar(db, o.id, "mailVencidaTs", FieldValue); throw e; }
      }
    }
  }
  return hechos;
}
