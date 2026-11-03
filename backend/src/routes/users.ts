import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { HttpError, asyncHandler } from "../lib/http";
import { hashPassword, requireFinanceiro } from "../lib/auth";

/** Usuários (só o financeiro): cria gestores presos a uma unidade. */
export const usersRouter = Router();
usersRouter.use(requireFinanceiro);

const select = { id: true, name: true, email: true, role: true, unitId: true, active: true, unit: { select: { name: true } } };

usersRouter.get("/", asyncHandler(async (_req, res) => {
  res.json(await prisma.user.findMany({ select, orderBy: { name: "asc" } }));
}));

const userSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["FINANCEIRO", "GESTOR"]),
  unitId: z.string().nullish(),
  password: z.string().min(6).optional(),
  active: z.boolean().optional(),
});

function checkUnit(data: { role: string; unitId?: string | null }) {
  if (data.role === "GESTOR" && !data.unitId) throw new HttpError(400, "Gestor precisa de uma unidade");
}

usersRouter.post("/", asyncHandler(async (req, res) => {
  const data = userSchema.parse(req.body);
  checkUnit(data);
  if (!data.password) throw new HttpError(400, "Informe uma senha (mínimo 6 caracteres)");
  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      role: data.role,
      unitId: data.role === "GESTOR" ? data.unitId : null,
      passwordHash: await hashPassword(data.password),
    },
    select,
  });
  res.status(201).json(user);
}));

usersRouter.put("/:id", asyncHandler(async (req, res) => {
  const data = userSchema.parse(req.body);
  checkUnit(data);
  if (req.params.id === req.user!.id && (data.active === false || data.role !== "FINANCEIRO")) {
    throw new HttpError(400, "Você não pode desativar nem tirar o perfil financeiro de você mesmo");
  }
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: {
      name: data.name,
      email: data.email,
      role: data.role,
      unitId: data.role === "GESTOR" ? data.unitId : null,
      active: data.active,
      ...(data.password ? { passwordHash: await hashPassword(data.password) } : {}),
    },
    select,
  });
  res.json(user);
}));
