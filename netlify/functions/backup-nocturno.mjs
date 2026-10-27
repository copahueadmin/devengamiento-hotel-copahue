// Función PROGRAMADA de Netlify: todas las noches a las 23:59 hs de Argentina manda la copia de seguridad por correo.
// Netlify programa en UTC y Argentina es UTC-3 todo el año (no hay horario de verano): 23:59 hs = 02:59 UTC.
// El programador de Netlify puede correr con unos minutos de atraso: el correo puede llegar apenas pasada la medianoche.
import { ejecutarCopia } from "../lib/backup.mjs";

export default async () => {
  const r = await ejecutarCopia();
  console.log("Copia de seguridad enviada:", JSON.stringify(r));
  return new Response(JSON.stringify(r), { headers: { "Content-Type": "application/json" } });
};

export const config = { schedule: "59 2 * * *" };
