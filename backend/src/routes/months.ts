import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { HttpError, asyncHandler } from "../lib/http";
import { assertUnitAccess } from "../lib/auth";
import { MIN_FREQUENCY, MONTH_NAMES, belowMinimum, monthRange } from "../lib/month";
import { isMenuEmpty, mealTotal, normalizeMenu } from "../lib/menu";
import { anexoIIPdf, anexoIIIPdf, anexoIVPdf, anexoVPdf } from "../documents/declaracoes";
import { anexoXIPdf } from "../documents/anexoXI";
import type { Student } from "@prisma/client";
import { loadSignatureStatus } from "../services/signatureStatus";
import { loadMonth } from "../documents/monthData";
import { anexoIPdf } from "../documents/anexoI";
import { anexoXPdf, anexoXXlsx } from "../documents/anexoX";

export const monthsRouter = Router();

/** Crianças que receberam material e uniforme dentro do mês. */
function materialDelivered(students: Student[], year: number, month: number) {
  const { start, end } = monthRange(year, month);
  return students.filter((s) => s.materialDeliveredAt && s.materialDeliveredAt >= start && s.materialDeliveredAt <= end);
}

function monthParams(req: Request) {
  const unitId = String(req.query.unitId ?? "");
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  if (!unitId) throw new HttpError(400, "Informe a unidade");
  assertUnitAccess(req.user!, unitId);
  return { unitId, year, month };
}

/** O que falta no cadastro pra gerar os anexos dessa criança. */
function pendingFields(s: { guardianName: string | null; guardianCpf: string | null; guardianPhone: string | null; grei: string }) {
  const p: string[] = [];
  if (!s.grei) p.push("GREI");
  if (!s.guardianName) p.push("nome do responsável");
  if (!s.guardianCpf) p.push("CPF do responsável");
  if (!s.guardianPhone) p.push("WhatsApp do responsável");
  return p;
}

monthsRouter.get("/", asyncHandler(async (req, res) => {
  const { unitId, year, month } = monthParams(req);
  const data = await loadMonth(unitId, year, month);
  res.json({
    unit: data.unit,
    year,
    month,
    schoolDays: data.schoolDays,
    minFrequency: MIN_FREQUENCY,
    materialDeliveries: materialDelivered(data.rows.map((r) => r.student), year, month).length,
    menuFilled: !isMenuEmpty(normalizeMenu(data.unit.menu)),
    mealTotal: data.schoolDays ? mealTotal(data.rows.length, data.schoolDays) : null,
    rows: data.rows.map((r) => ({
      studentId: r.student.id,
      name: r.student.name,
      grei: r.student.grei,
      shift: r.student.shift,
      justifiedAbsences: r.justifiedAbsences,
      unjustifiedAbsences: r.unjustifiedAbsences,
      frequency: r.frequency,
      belowMinimum: belowMinimum(r.frequency),
      pending: pendingFields(r.student),
    })),
  });
}));

const saveSchema = z.object({
  unitId: z.string().min(1),
  year: z.number().int().min(2000),
  month: z.number().int().min(1).max(12),
  schoolDays: z.number().int().min(1, "dias letivos precisa ser maior que zero").max(31),
  attendances: z.array(
    z.object({
      studentId: z.string().min(1),
      justifiedAbsences: z.number().int().min(0),
      unjustifiedAbsences: z.number().int().min(0),
    })
  ),
});

monthsRouter.put("/", asyncHandler(async (req, res) => {
  const data = saveSchema.parse(req.body);
  assertUnitAccess(req.user!, data.unitId);
  const current = await loadMonth(data.unitId, data.year, data.month);
  const enrolled = new Map(current.rows.map((r) => [r.student.id, r.student.name]));
  for (const a of data.attendances) {
    const name = enrolled.get(a.studentId);
    if (!name) throw new HttpError(400, "Uma das crianças não está matriculada nesse mês");
    if (a.justifiedAbsences + a.unjustifiedAbsences > data.schoolDays) {
      throw new HttpError(400, `${name}: as faltas passam dos ${data.schoolDays} dias letivos`);
    }
  }
  await prisma.$transaction(async (tx) => {
    const report = await tx.monthlyReport.upsert({
      where: { unitId_year_month: { unitId: data.unitId, year: data.year, month: data.month } },
      create: { unitId: data.unitId, year: data.year, month: data.month, schoolDays: data.schoolDays },
      update: { schoolDays: data.schoolDays },
    });
    for (const a of data.attendances) {
      await tx.attendance.upsert({
        where: { reportId_studentId: { reportId: report.id, studentId: a.studentId } },
        create: { reportId: report.id, ...a },
        update: { justifiedAbsences: a.justifiedAbsences, unjustifiedAbsences: a.unjustifiedAbsences },
      });
    }
  });
  res.json({ ok: true });
}));

/** Painel: situação de cada unidade no mês. */
monthsRouter.get("/overview", asyncHandler(async (req, res) => {
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  const user = req.user!;
  const units = await prisma.unit.findMany({
    where: { active: true, ...(user.role === "GESTOR" ? { id: user.unitId ?? "-" } : {}) },
    orderBy: { name: "asc" },
  });
  const result = [];
  for (const unit of units) {
    const data = await loadMonth(unit.id, year, month);
    const report = await prisma.monthlyReport.findUnique({
      where: { unitId_year_month: { unitId: unit.id, year, month } },
      select: { updatedAt: true, _count: { select: { attendances: true } } },
    });
    result.push({
      unitId: unit.id,
      unitName: unit.name,
      students: data.rows.length,
      schoolDays: data.schoolDays,
      attendanceSaved: report !== null,
      updatedAt: report?.updatedAt ?? null,
      belowMinimum: data.rows.filter((r) => belowMinimum(r.frequency)).length,
      pendingRegistration: data.rows.filter((r) => pendingFields(r.student).length > 0).length,
      signaturesComplete: data.rows.length ? (await loadSignatureStatus(unit.id, year, month)).rows.filter((r) => r.complete).length : 0,
    });
  }
  res.json(result);
}));

/** ?studentId=… gera o anexo só daquela criança (para imprimir e assinar). */
async function readyMonth(req: Request) {
  const { unitId, year, month } = monthParams(req);
  const data = await loadMonth(unitId, year, month);
  const studentId = req.query.studentId ? String(req.query.studentId) : null;
  if (studentId) data.rows = data.rows.filter((r) => r.student.id === studentId);
  if (data.rows.length === 0) throw new HttpError(400, studentId ? "Essa criança não está matriculada nesse mês" : "Nenhuma criança matriculada nesse mês");
  return data;
}

/** "ANEXO 1.pdf", ou "ANEXO 1 - Nome da Criança.pdf" quando é de uma criança só. */
function docName(req: Request, data: { rows: { student: { name: string } }[] }, base: string) {
  return req.query.studentId ? `${base} - ${data.rows[0].student.name}.pdf` : `${base}.pdf`;
}

function send(res: import("express").Response, buffer: Buffer, fileName: string, type: string) {
  res.setHeader("Content-Type", type);
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
  res.send(buffer);
}

// Nome do arquivo = tipo do documento, como a prefeitura pede ("ANEXO 1", "ANEXO 10")
monthsRouter.get("/anexo-1.pdf", asyncHandler(async (req, res) => {
  const data = await readyMonth(req);
  send(res, await anexoIPdf(data), docName(req, data, "ANEXO 1"), "application/pdf");
}));

monthsRouter.get("/anexo-10.pdf", asyncHandler(async (req, res) => {
  const data = await readyMonth(req);
  if (!data.schoolDays) throw new HttpError(400, "Lance os dias letivos e as faltas do mês antes de gerar o Anexo X");
  send(res, await anexoXPdf(data), "ANEXO 10.pdf", "application/pdf");
}));

monthsRouter.get("/anexo-2.pdf", asyncHandler(async (req, res) => {
  const data = await readyMonth(req);
  send(res, await anexoIIPdf(data.unit, data.year, data.rows.map((r) => r.student)), docName(req, data, "ANEXO 2"), "application/pdf");
}));

monthsRouter.get("/anexo-3.pdf", asyncHandler(async (req, res) => {
  const data = await readyMonth(req);
  send(res, await anexoIIIPdf(data.unit, data.rows.map((r) => r.student)), docName(req, data, "ANEXO 3"), "application/pdf");
}));

monthsRouter.get("/anexo-4.pdf", asyncHandler(async (req, res) => {
  const data = await readyMonth(req);
  send(res, await anexoIVPdf(data.unit, data.rows.map((r) => r.student)), docName(req, data, "ANEXO 4"), "application/pdf");
}));

// Anexo V: só quem recebeu material e uniforme no mês (taxa única por aluno)
monthsRouter.get("/anexo-5.pdf", asyncHandler(async (req, res) => {
  const data = await readyMonth(req);
  // de uma criança só (para assinar): vale a entrega de qualquer mês
  const students = req.query.studentId
    ? data.rows.map((r) => r.student).filter((s) => s.materialDeliveredAt)
    : materialDelivered(data.rows.map((r) => r.student), data.year, data.month);
  if (students.length === 0) {
    throw new HttpError(
      400,
      `Nenhuma entrega de material e uniforme em ${MONTH_NAMES[data.month - 1]}/${data.year}. ` +
        "Informe a data de entrega no cadastro da criança (Crianças → Editar)."
    );
  }
  send(res, await anexoVPdf(data.unit, students), docName(req, data, "ANEXO 5"), "application/pdf");
}));

monthsRouter.get("/anexo-11.pdf", asyncHandler(async (req, res) => {
  const data = await readyMonth(req);
  if (!data.schoolDays) throw new HttpError(400, "Lance os dias letivos do mês antes de gerar o Anexo XI");
  const menu = normalizeMenu(data.unit.menu);
  if (isMenuEmpty(menu)) throw new HttpError(400, "Preencha o cardápio da unidade (menu Cardápio) antes de gerar o Anexo XI");
  send(res, await anexoXIPdf(data, menu), "ANEXO 11.pdf", "application/pdf");
}));

monthsRouter.get("/anexo-10.xlsx", asyncHandler(async (req, res) => {
  const data = await readyMonth(req);
  send(res, await anexoXXlsx(data), "ANEXO 10.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}));
