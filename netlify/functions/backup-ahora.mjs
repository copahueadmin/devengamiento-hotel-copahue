// Para PROBAR (o pedir una copia a mano): abrir  https://TU-SITIO.netlify.app/.netlify/functions/backup-ahora?clave=LA_CLAVE
// Hace lo mismo que la copia nocturna. Solo funciona si en Netlify se cargó la variable BACKUP_CLAVE; sin esa variable queda deshabilitada.
import { ejecutarCopia } from "../lib/backup.mjs";

export default async (req) => {
  const clave = process.env.BACKUP_CLAVE, dada = new URL(req.url).searchParams.get("clave");
  const json = (c, o) => new Response(JSON.stringify(o, null, 2), { status: c, headers: { "Content-Type": "application/json; charset=utf-8" } });
  if (!clave) return json(403, { error: "Deshabilitada: falta la variable BACKUP_CLAVE en Netlify." });
  if (dada !== clave) return json(401, { error: "Clave incorrecta." });
  try { return json(200, await ejecutarCopia()); }
  catch (e) { return json(500, { error: String((e && e.message) || e) }); }
};
