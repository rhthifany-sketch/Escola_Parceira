import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/http";
import { requireFinanceiro } from "../lib/auth";
import { nextSend } from "../lib/schedule";
import { zapsignEnabled, zapsignIsSandbox } from "../lib/zapsign";
import { getSettings } from "../services/scheduler";

/** Configurações gerais (só o financeiro). */
export const settingsRouter = Router();
settingsRouter.use(requireFinanceiro);

async function view() {
  const settings = await getSettings();
  const runs = await prisma.autoSendRun.findMany({ orderBy: [{ year: "desc" }, { month: "desc" }], take: 12 });
  const done = new Set(runs.map((r) => `${r.year}-${r.month}`));
  return {
    settings,
    zapsign: zapsignEnabled() ? { sandbox: zapsignIsSandbox() } : null,
    next: nextSend(settings, (ref) => done.has(`${ref.year}-${ref.month}`)),
    runs,
  };
}

settingsRouter.get("/", asyncHandler(async (_req, res) => res.json(await view())));

settingsRouter.put("/", asyncHandler(async (req, res) => {
  const data = z
    .object({
      autoSendEnabled: z.boolean(),
      autoSendDay: z.number().int().min(1).max(28),
      autoSendMonth: z.enum(["ATUAL", "ANTERIOR"]),
      autoSendWhatsapp: z.boolean(),
    })
    .parse(req.body);
  await prisma.settings.upsert({ where: { id: "geral" }, create: { id: "geral", ...data }, update: data });
  res.json(await view());
}));

/** Libera o envio de um mês de novo (apaga o registro do envio). */
settingsRouter.delete("/runs/:id", asyncHandler(async (req, res) => {
  await prisma.autoSendRun.delete({ where: { id: req.params.id } });
  res.json(await view());
}));
