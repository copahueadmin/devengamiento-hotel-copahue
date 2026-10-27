// Copia de seguridad del sistema "Resultados y Devengamiento" — Hotel Copahue.
// Lee TODOS los datos de Firestore (proyecto devengamiento-hotel-copahue), arma un .zip y lo envía por correo.
// Formato del .zip (es el mismo que genera y restaura la pantalla de "Copias de seguridad" del sistema):
//   copia.json · datos/copahue_kv.json · datos/ordenes_pago.json · datos/ordenes_meta.json · movimientos.csv · LEEME.txt
import JSZip from "jszip";
import { conectarFirestore, crearTransporte, REMITENTE, partesAR, AVISO_AUTO, CABECERAS_AUTO } from "./comun.mjs";
const PIE = `\n\n—\nCORREO AUTOMÁTICO — NO RESPONDER.\n${AVISO_AUTO}`;

export const BK_APP = "devengamiento-hotel-copahue";
export const BK_VERSION = 1;
export const DESTINO = process.env.BACKUP_TO || "copahueadmin@gmail.com";
const LIMITE_ADJUNTO = 24 * 1024 * 1024; // Gmail admite hasta 25 MB por mensaje
export { conectarFirestore, crearTransporte };

// ───────── Firestore ─────────
export async function leerEstado(db) {
  const kv = {}, ordenes = {}, meta = {};
  const [a, b, c] = await Promise.all([db.collection("copahue_kv").get(), db.collection("ordenes_pago").get(), db.collection("ordenes_meta").get()]);
  a.forEach((d) => { kv[d.id] = (d.data() || {}).value; });
  b.forEach((d) => { ordenes[d.id] = d.data(); });
  c.forEach((d) => { meta[d.id] = d.data(); });
  return { kv, ordenes, meta };
}

// ───────── Armado del zip ─────────
function movimientosDe(kv) {
  let todos = [];
  Object.keys(kv).filter((k) => k.startsWith("copahue:movs:")).sort().forEach((k) => { try { const a = JSON.parse(kv[k]); if (Array.isArray(a)) todos = todos.concat(a); } catch (e) { /* año ilegible: se ignora en el csv */ } });
  return todos;
}
export function resumenDe(est) {
  const movs = movimientosDe(est.kv); let usuarios = 0, historial = 0;
  try { usuarios = (JSON.parse(est.kv["copahue:config"] || "{}").usuarios || []).length; } catch (e) { /* */ }
  Object.keys(est.kv).filter((k) => k.startsWith("copahue:hist:")).forEach((k) => { try { historial += JSON.parse(est.kv[k]).length; } catch (e) { /* */ } });
  return { movimientos: movs.length, historial, ordenesPago: Object.keys(est.ordenes).length, usuarios, documentos: Object.keys(est.kv).length };
}
function csvDe(movs) {
  const cols = ["id", "tipo", "mesPago", "mesCorr", "rubro", "item", "bruto", "moneda", "fechaVenc", "pago", "fechaPago", "metodoPago", "detalle"];
  const q = (v) => { v = v === undefined || v === null ? "" : String(v); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  return "﻿" + [cols.join(",")].concat(movs.map((m) => cols.map((c) => q(m[c])).join(","))).join("\r\n");
}
export async function armarZip(est, fecha = new Date()) {
  const info = { app: BK_APP, version: BK_VERSION, generada: fecha.toISOString(), origen: "nocturna", resumen: resumenDe(est) };
  const f = partesAR(fecha), legible = `${f.day}/${f.month}/${f.year} ${f.hour}:${f.minute}`;
  const z = new JSZip();
  z.file("copia.json", JSON.stringify(info, null, 2));
  z.file("datos/copahue_kv.json", JSON.stringify(est.kv));
  z.file("datos/ordenes_pago.json", JSON.stringify(est.ordenes));
  z.file("datos/ordenes_meta.json", JSON.stringify(est.meta));
  z.file("movimientos.csv", csvDe(movimientosDe(est.kv)));
  z.file("LEEME.txt", `Copia de seguridad del sistema Resultados y Devengamiento — Hotel Copahue.\r\nGenerada: ${legible} (hora de Argentina)\r\nMovimientos: ${info.resumen.movimientos} · Órdenes de pago: ${info.resumen.ordenesPago} · Usuarios: ${info.resumen.usuarios}\r\n\r\nPara restaurar: iniciá sesión con un usuario habilitado, tocá el ícono de restaurar (junto al de cerrar sesión) y elegí este archivo .zip sin descomprimirlo.\r\nmovimientos.csv es solo para leer en Excel; no se usa al restaurar.\r\n`);
  const buffer = await z.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } });
  return { buffer, info, legible, nombre: `copia-devengamiento-${f.year}-${f.month}-${f.day}_${f.hour}${f.minute}.zip` };
}

// ───────── Correo (Gmail con "contraseña de aplicación") ─────────
export async function enviarCopia(transporte, zip) {
  const r = zip.info.resumen, vacia = r.movimientos === 0;
  if (zip.buffer.length > LIMITE_ADJUNTO) throw new Error(`La copia pesa ${(zip.buffer.length / 1048576).toFixed(1)} MB y supera el límite de Gmail (25 MB).`);
  return transporte.sendMail({
    from: REMITENTE(),
    to: DESTINO,
    subject: `${vacia ? "ATENCIÓN (sin movimientos) — " : ""}Copia de seguridad Devengamiento — ${zip.legible}`,
    text: `Copia de seguridad automática del sistema Resultados y Devengamiento.\n\nGenerada: ${zip.legible} (hora de Argentina)\nMovimientos: ${r.movimientos}\nHistorial: ${r.historial}\nÓrdenes de pago: ${r.ordenesPago}\nUsuarios: ${r.usuarios}\n\n${vacia ? "ATENCIÓN: la copia no tiene movimientos. Revisá que los datos del sistema estén completos.\n\n" : ""}Para restaurar: iniciá sesión en el sistema con un usuario habilitado, tocá el ícono de restaurar (junto al de cerrar sesión) y elegí el .zip adjunto.${PIE}`,
    attachments: [{ filename: zip.nombre, content: zip.buffer, contentType: "application/zip" }],
    headers: CABECERAS_AUTO,
  });
}
export async function avisarFallo(transporte, error) {
  try {
    await transporte.sendMail({ from: REMITENTE(), to: DESTINO, subject: "FALLÓ la copia de seguridad nocturna — Devengamiento", text: `La copia de seguridad automática de esta noche no se pudo completar.\n\nMotivo: ${String((error && error.message) || error)}\n\nRevisá los registros de la función "backup-nocturno" en Netlify (Logs → Functions).${PIE}`, headers: CABECERAS_AUTO });
  } catch (e) { /* si ni el aviso sale, queda el registro de Netlify */ }
}

// ───────── Todo junto ─────────
export async function ejecutarCopia({ db, transporte } = {}) {
  let t = transporte;
  try {
    t = t || crearTransporte();
    const est = await leerEstado(db || conectarFirestore());
    const zip = await armarZip(est);
    const info = await enviarCopia(t, zip);
    return { ok: true, archivo: zip.nombre, kb: Math.round(zip.buffer.length / 1024), resumen: zip.info.resumen, mensaje: info && info.messageId };
  } catch (e) {
    if (t) await avisarFallo(t, e);
    throw e;
  }
}
