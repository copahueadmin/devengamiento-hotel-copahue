// Función PROGRAMADA (cada minuto): despacha la cola de avisos de órdenes de pago.
//   · Comentarios/preguntas: junta los de 1 minuto en un solo correo y solo lo manda si la otra persona no está en línea.
//   · Autorización/rechazo: manda el resumen cuando pasó 1 minuto desde la última decisión (si quedó algo pendiente).
// Funciona aunque nadie tenga el sistema abierto.
import { conectarFirestore, crearTransporte } from "../lib/comun.mjs";
import { procesarCola } from "../lib/ordenes-mail.mjs";

export default async () => {
  const r = await procesarCola({ db: conectarFirestore(), transporte: crearTransporte() });
  if (r.hechos.length) console.log("Cola de OP — enviados:", r.hechos.join(", "));
  if (r.errores.length) console.error("Cola de OP — errores:", r.errores.join(" | "));
  return new Response(JSON.stringify({ ok: true, ...r }), { headers: { "Content-Type": "application/json" } });
};
export const config = { schedule: "* * * * *" };
