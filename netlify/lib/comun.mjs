// Piezas compartidas por las funciones de Netlify de este sitio: conexión a Firestore (Firebase Admin) y envío de correo (Gmail).
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import nodemailer from "nodemailer";

export const PROJECT = process.env.FIREBASE_PROJECT_ID || "devengamiento-hotel-copahue";
export const TZ = "America/Argentina/Buenos_Aires";

function iniciarApp() {
  if (!getApps().length) {
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL, key = process.env.FIREBASE_PRIVATE_KEY;
    if (!clientEmail || !key) throw new Error("Faltan las variables FIREBASE_CLIENT_EMAIL y FIREBASE_PRIVATE_KEY en Netlify.");
    initializeApp({ credential: cert({ projectId: PROJECT, clientEmail, privateKey: key.replace(/\\n/g, "\n") }) });
  }
}
export function conectarFirestore() { iniciarApp(); return getFirestore(); }
export function verificarToken(token) { iniciarApp(); return getAuth().verifyIdToken(token); }
export { FieldValue };

// Envío de correo. Si está RESEND_API_KEY se usa Resend (recomendado: permite enviar desde una dirección "no-responder" del dominio);
// si no, Gmail con una "contraseña de aplicación" (GMAIL_USER + GMAIL_APP_PASSWORD). Los dos devuelven un objeto con sendMail({...}).
export function crearTransporte() {
  const rk = process.env.RESEND_API_KEY;
  if (rk) {
    return {
      async sendMail(m) {
        const body = { from: m.from, to: String(m.to).split(",").map((x) => x.trim()).filter(Boolean), subject: m.subject, text: m.text };
        if (m.html) body.html = m.html;
        if (m.headers) body.headers = m.headers;
        if (m.attachments && m.attachments.length) body.attachments = m.attachments.map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString("base64") }));
        const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${rk}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(`Resend rechazó el envío (${r.status}): ${j.message || JSON.stringify(j)}`);
        return { messageId: j.id };
      },
    };
  }
  const user = process.env.GMAIL_USER, pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error("Falta configurar el envío de correo en Netlify: RESEND_API_KEY (recomendado) o GMAIL_USER + GMAIL_APP_PASSWORD.");
  return nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
}
// Remitente: MAIL_FROM si se define; con Resend, "no-responder@hotelcopahue.com" (el dominio tiene que estar verificado en Resend); con Gmail, la propia cuenta.
export const REMITENTE = () => process.env.MAIL_FROM || (process.env.RESEND_API_KEY ? `"Devengamiento Hotel Copahue" <no-responder@hotelcopahue.com>` : `"Devengamiento Hotel Copahue" <${process.env.GMAIL_USER}>`);

// Todos los correos del sistema llevan este aviso al pie y las cabeceras estándar de "mensaje automático".
export const AVISO_AUTO = "Este es un correo automático del sistema. No lo responda: esta casilla no se revisa y las respuestas no llegan a nadie. Para consultas, comuníquese por los medios habituales.";
export const CABECERAS_AUTO = { "Auto-Submitted": "auto-generated", "X-Auto-Response-Suppress": "All", Precedence: "bulk" };

// Fecha y hora de Argentina (UTC-3 todo el año) en partes {year, month, day, hour, minute}
export function partesAR(fecha) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(fecha).reduce((o, x) => { o[x.type] = x.value; return o; }, {});
}
export function fechaHoraAR(iso) { const f = partesAR(new Date(iso)); return `${f.day}/${f.month} ${f.hour}:${f.minute}`; }
