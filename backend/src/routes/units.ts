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

/**
 * Exclui a unidade com tudo dela: crianças, meses/faltas lançados e os
 * gestores ligados a ela (gestor sem unidade não consegue entrar).
 */
unitsRouter.delete("/:id", requireFinanceiro, asyncHandler(async (req, res) => {
  const unit = await prisma.unit.findUniqueOrThrow({ where: { id: req.params.id } });
  const result = await prisma.$transaction(async (tx) => {
    const reports = await tx.monthlyReport.deleteMany({ where: { unitId: unit.id } });
    const students = await tx.student.deleteMany({ where: { unitId: unit.id } });
    const users = await tx.user.deleteMany({ where: { unitId: unit.id, role: "GESTOR" } });
    await tx.user.updateMany({ where: { unitId: unit.id }, data: { unitId: null } });
    await tx.unit.delete({ where: { id: unit.id } });
    return { students: students.count, months: reports.count, users: users.count };
  });
  res.json(result);
}));

/** Quanto será apagado junto com a unidade (para a confirmação). */
unitsRouter.get("/:id/usage", requireFinanceiro, asyncHandler(async (req, res) => {
  const [students, months, users] = await Promise.all([
    prisma.student.count({ where: { unitId: req.params.id } }),
    prisma.monthlyReport.count({ where: { unitId: req.params.id } }),
    prisma.user.count({ where: { unitId: req.params.id, role: "GESTOR" } }),
  ]);
  res.json({ students, months, users });
}));
