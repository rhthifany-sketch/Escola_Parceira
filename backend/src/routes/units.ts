import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/http";
import { assertUnitAccess, requireFinanceiro } from "../lib/auth";

export const unitsRouter = Router();

const unitSchema = z.object({
  name: z.string().trim().min(2),
  legalName: z.string().trim().min(2),
  cnpj: z.string().trim().min(14),
  legalRepName: z.string().trim().min(2),
  legalRepCpf: z.string().trim().min(11),
  active: z.boolean().optional(),
});

unitsRouter.get("/", asyncHandler(async (req, res) => {
  const user = req.user!;
  const units = await prisma.unit.findMany({
    where: user.role === "GESTOR" ? { id: user.unitId ?? "-" } : {},
    orderBy: { name: "asc" },
    include: { _count: { select: { students: { where: { exitDate: null } } } } },
  });
  res.json(units);
}));

unitsRouter.get("/:id", asyncHandler(async (req, res) => {
  assertUnitAccess(req.user!, req.params.id);
  res.json(await prisma.unit.findUniqueOrThrow({ where: { id: req.params.id } }));
}));

unitsRouter.post("/", requireFinanceiro, asyncHandler(async (req, res) => {
  res.status(201).json(await prisma.unit.create({ data: unitSchema.parse(req.body) }));
}));

unitsRouter.put("/:id", requireFinanceiro, asyncHandler(async (req, res) => {
  res.json(await prisma.unit.update({ where: { id: req.params.id }, data: unitSchema.parse(req.body) }));
}));
