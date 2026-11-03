import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { HttpError, asyncHandler } from "../lib/http";
import { assertUnitAccess } from "../lib/auth";
import { parseDate } from "../lib/month";
import { normalize, readStudentsSheet } from "../lib/importStudents";

export const studentsRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const optionalText = z.string().trim().nullish().transform((v) => v || null);
const dateField = z.string().nullish().transform((v, ctx) => {
  if (!v) return null;
  const d = parseDate(v);
  if (!d) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "data inválida" });
  return d;
});

const studentSchema = z.object({
  unitId: z.string().min(1),
  name: z.string().trim().min(3),
  shift: z.string().trim().min(1),
  grei: z.string().trim().min(1),
  birthDate: dateField,
  phone: optionalText,
  address: optionalText,
  email: optionalText,
  enrollmentDate: dateField.refine((d) => d !== null, "informe a data de matrícula"),
  exitDate: dateField,
  guardianName: optionalText,
  guardianCpf: optionalText,
  guardianPhone: optionalText,
  materialDeliveredAt: dateField,
});

studentsRouter.get("/", asyncHandler(async (req, res) => {
  const unitId = String(req.query.unitId ?? "");
  if (!unitId) throw new HttpError(400, "Informe a unidade");
  assertUnitAccess(req.user!, unitId);
  const students = await prisma.student.findMany({ where: { unitId } });
  students.sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
  res.json(students);
}));

studentsRouter.post("/", asyncHandler(async (req, res) => {
  const data = studentSchema.parse(req.body);
  assertUnitAccess(req.user!, data.unitId);
  res.status(201).json(await prisma.student.create({ data: { ...data, enrollmentDate: data.enrollmentDate! } }));
}));

studentsRouter.put("/:id", asyncHandler(async (req, res) => {
  const current = await prisma.student.findUniqueOrThrow({ where: { id: req.params.id } });
  assertUnitAccess(req.user!, current.unitId);
  const data = studentSchema.parse({ ...req.body, unitId: current.unitId });
  res.json(await prisma.student.update({ where: { id: current.id }, data: { ...data, enrollmentDate: data.enrollmentDate! } }));
}));

/**
 * Exclui de vez a criança e as faltas lançadas dela (para cadastro de teste
 * ou feito errado). Quem saiu do programa deve ganhar data de saída, não ser
 * excluído — senão some dos meses em que estava matriculada.
 */
studentsRouter.delete("/:id", asyncHandler(async (req, res) => {
  const current = await prisma.student.findUniqueOrThrow({ where: { id: req.params.id } });
  assertUnitAccess(req.user!, current.unitId);
  await prisma.student.delete({ where: { id: current.id } });
  res.status(204).end();
}));

studentsRouter.post("/delete-many", asyncHandler(async (req, res) => {
  const { ids } = z.object({ ids: z.array(z.string().min(1)).min(1) }).parse(req.body);
  const students = await prisma.student.findMany({ where: { id: { in: ids } }, select: { id: true, unitId: true } });
  for (const s of students) assertUnitAccess(req.user!, s.unitId);
  const { count } = await prisma.student.deleteMany({ where: { id: { in: students.map((s) => s.id) } } });
  res.json({ deleted: count });
}));

/**
 * Importa as crianças de uma planilha no formato do Anexo X. Quem já está
 * cadastrado na unidade (mesmo nome) é atualizado; o resto entra novo.
 * Campo vazio na planilha não apaga o que já está no cadastro.
 */
studentsRouter.post("/import", upload.single("file"), asyncHandler(async (req, res) => {
  const unitId = String(req.body.unitId ?? "");
  if (!unitId) throw new HttpError(400, "Informe a unidade");
  assertUnitAccess(req.user!, unitId);
  if (!req.file) throw new HttpError(400, "Envie a planilha (.xlsx)");
  const { rows, errors } = await readStudentsSheet(req.file.buffer);
  const existing = await prisma.student.findMany({ where: { unitId } });
  const byName = new Map(existing.map((s) => [normalize(s.name), s]));
  let created = 0;
  let updated = 0;
  for (const r of rows) {
    const current = byName.get(normalize(r.name));
    const fields = {
      shift: r.shift || undefined,
      grei: r.grei || undefined,
      birthDate: r.birthDate ?? undefined,
      phone: r.phone ?? undefined,
      address: r.address ?? undefined,
      email: r.email ?? undefined,
      enrollmentDate: r.enrollmentDate ?? undefined,
      guardianName: r.guardianName ?? undefined,
      guardianCpf: r.guardianCpf ?? undefined,
      guardianPhone: r.guardianPhone ?? undefined,
    };
    if (current) {
      await prisma.student.update({ where: { id: current.id }, data: fields });
      updated++;
    } else if (r.enrollmentDate) {
      const s = await prisma.student.create({
        data: { ...fields, unitId, name: r.name, shift: r.shift, grei: r.grei, enrollmentDate: r.enrollmentDate },
      });
      byName.set(normalize(s.name), s);
      created++;
    }
  }
  res.json({ created, updated, errors });
}));
