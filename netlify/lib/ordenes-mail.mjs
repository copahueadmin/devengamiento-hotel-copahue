// Avisos por correo de las órdenes de pago (OP).
//   · Administración emite / modifica / elimina una OP  → mail a quien autoriza (José), SOLO con totales (sin nombrar ítems).
//   · José autoriza / rechaza / deshace / pregunta / responde → mail a administración (quien emitió la OP + giuliano.zolvini).
//   · Pregunta o comentario nuevo → mail a la otra parte.
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
