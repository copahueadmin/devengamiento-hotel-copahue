// Función PROGRAMADA (cada 15 minutos): avisos por correo de las órdenes de pago que no dependen de que alguien tenga el sistema abierto:
//   · una OP programada que llegó a su hora de publicación → aviso a quien autoriza;
//   · una OP que se venció (total o parcialmente) → aviso a las dos partes.
// Cada aviso se manda una sola vez (queda marcado en la orden: mailCreadaTs / mailVencidaTs).
import { conectarFirestore, crearTransporte, FieldValue } from "../lib/comun.mjs";
import { revisarOrdenes } from "../lib/ordenes-mail.mjs";

export default async () => {
  const hechos = await revisarOrdenes({ db: conectarFirestore(), transporte: crearTransporte(), FieldValue });
  if (hechos.length) console.log("Avisos de OP enviados:", hechos.join(", "));
  return new Response(JSON.stringify({ ok: true, enviados: hechos }), { headers: { "Content-Type": "application/json" } });
};
export const config = { schedule: "*/15 * * * *" };
