import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { dueReference } from "../lib/schedule";
import { zapsignEnabled } from "../lib/zapsign";
import { refreshOpen, sendUnit, type SendSummary } from "./signPackage";

export const getSettings = () => prisma.settings.upsert({ where: { id: "geral" }, create: { id: "geral" }, update: {} });

/**
 * Envio automático do mês: no dia escolhido (horário de Brasília) cria os
 * pacotes de assinatura de todas as crianças com pendência, em todas as
 * unidades ativas, e a ZapSign manda o convite pelo WhatsApp. Roda uma vez
 * por mês de referência (a linha em auto_send_runs impede repetir, mesmo
 * com o servidor reiniciando).
 */
export async function runAutoSendIfDue(now = new Date()) {
  if (!zapsignEnabled()) return null;
  const settings = await getSettings();
  const ref = dueReference(settings, now);
  if (!ref) return null;
  let run;
  try {
    run = await prisma.autoSendRun.create({ data: { ...ref, summary: { andamento: true } } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return null; // já enviado
    throw err;
  }
  const summary: SendSummary = { sent: 0, skipped: [], errors: [] };
  const units = await prisma.unit.findMany({ where: { active: true }, select: { id: true } });
  for (const u of units) {
    try {
      await sendUnit(u.id, ref.year, ref.month, { auto: true, whatsapp: settings.autoSendWhatsapp }, summary);
    } catch (err) {
      summary.errors.push({ unit: u.id, student: "-", error: err instanceof Error ? err.message : String(err) });
    }
  }
  await prisma.autoSendRun.update({ where: { id: run.id }, data: { summary: summary as never } });
  console.log(`Envio automático ${ref.month}/${ref.year}: ${summary.sent} enviado(s), ${summary.skipped.length} pulado(s), ${summary.errors.length} erro(s)`);
  return summary;
}

const MIN = 60 * 1000;
let lastRefresh = 0;

/** Verifica a cada 30 min; atualiza as assinaturas abertas a cada 3 h (além do webhook). */
export function startScheduler() {
  const tick = async () => {
    try {
      await runAutoSendIfDue();
      if (zapsignEnabled() && Date.now() - lastRefresh > 180 * MIN) {
        lastRefresh = Date.now();
        const r = await refreshOpen();
        if (r.checked) console.log(`Assinaturas ZapSign conferidas: ${r.checked}, concluídas agora: ${r.signed}`);
      }
    } catch (err) {
      console.error("Agendador:", err);
    }
  };
  setTimeout(tick, MIN);
  setInterval(tick, 30 * MIN);
}
