import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { PDFDocument } from "pdf-lib";
import type { SignedDocType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { HttpError, asyncHandler } from "../lib/http";
import { assertUnitAccess } from "../lib/auth";
import { MONTH_NAMES } from "../lib/month";
import { readPdfSignatures, type PdfSignature } from "../lib/pdfSignatures";
import { DOC_TYPES, SIGN_RULES, evaluateDoc, isRequired, whatsappLink, whatsappMessage } from "../lib/signatureRules";
import { loadMonth } from "../documents/monthData";

export const signaturesRouter = Router();
const MAX_MB = 10;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_MB * 1024 * 1024 } });

/** Situação das assinaturas de cada criança matriculada no mês. */
export async function loadSignatureStatus(unitId: string, year: number, month: number) {
  const data = await loadMonth(unitId, year, month);
  const ids = data.rows.map((r) => r.student.id);
  const docs = await prisma.signedDocument.findMany({
    where: {
      studentId: { in: ids },
      OR: [{ type: "ANEXO_I", year, month }, { type: { not: "ANEXO_I" } }],
    },
    select: { id: true, studentId: true, type: true, fileName: true, method: true, signatures: true, uploadedAt: true, uploadedBy: { select: { name: true } } },
    orderBy: { uploadedAt: "desc" },
  });
  const latest = new Map<string, (typeof docs)[number]>();
  for (const d of docs) if (!latest.has(`${d.studentId}|${d.type}`)) latest.set(`${d.studentId}|${d.type}`, d);

  const school = { name: data.unit.legalRepName, cpf: data.unit.legalRepCpf };
  const monthLabel = `${MONTH_NAMES[month - 1]}/${year}`;
  const rows = data.rows.map(({ student }) => {
    const guardian = { name: student.guardianName, cpf: student.guardianCpf };
    const items = DOC_TYPES.filter((t) => isRequired(t, student)).map((type) => {
      const doc = latest.get(`${student.id}|${type}`);
      const evaluation = doc ? evaluateDoc(type, { method: doc.method, signatures: doc.signatures as unknown as PdfSignature[] }, guardian, school) : null;
      return {
        type,
        label: SIGN_RULES[type].label,
        needsGuardian: SIGN_RULES[type].guardian,
        needsSchool: SIGN_RULES[type].school,
        doc: doc ? {
          id: doc.id,
          fileName: doc.fileName,
          method: doc.method,
          signatures: doc.signatures,
          uploadedAt: doc.uploadedAt,
          uploadedBy: doc.uploadedBy?.name ?? null,
        } : null,
        complete: evaluation?.complete ?? false,
        missing: evaluation?.missing ?? [],
        altered: evaluation?.altered ?? false,
      };
    });
    const pendingFromGuardian = items.filter((i) => !i.complete && i.needsGuardian).map((i) => i.label);
    return {
      studentId: student.id,
      name: student.name,
      guardianName: student.guardianName,
      guardianPhone: student.guardianPhone,
      complete: items.every((i) => i.complete),
      items,
      whatsapp: pendingFromGuardian.length
        ? whatsappLink(
            student.guardianPhone,
            whatsappMessage({ guardianName: student.guardianName, studentName: student.name, unitName: data.unit.name, pending: pendingFromGuardian, monthLabel })
          )
        : null,
    };
  });
  return { unit: data.unit, rows };
}

function monthQuery(q: Record<string, unknown>) {
  const unitId = String(q.unitId ?? "");
  const year = Number(q.year);
  const month = Number(q.month);
  if (!unitId) throw new HttpError(400, "Informe a unidade");
  return { unitId, year, month };
}

signaturesRouter.get("/", asyncHandler(async (req, res) => {
  const { unitId, year, month } = monthQuery(req.query);
  assertUnitAccess(req.user!, unitId);
  const { rows } = await loadSignatureStatus(unitId, year, month);
  res.json({ rows, maxMb: MAX_MB });
}));

const uploadSchema = z.object({
  studentId: z.string().min(1),
  type: z.enum(DOC_TYPES as [SignedDocType, ...SignedDocType[]]),
  year: z.coerce.number().int().min(2000),
  month: z.coerce.number().int().min(1).max(12),
});

/**
 * Envio do anexo assinado (escaneado do papel ou PDF assinado digitalmente).
 * Substitui o que já havia para a mesma criança/anexo (/mês, no Anexo I).
 */
signaturesRouter.post("/upload", upload.single("file"), asyncHandler(async (req, res) => {
  const data = uploadSchema.parse(req.body);
  const student = await prisma.student.findUniqueOrThrow({ where: { id: data.studentId } });
  assertUnitAccess(req.user!, student.unitId);
  const file = req.file;
  if (!file) throw new HttpError(400, "Envie o PDF assinado");
  if (file.buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new HttpError(400, "O arquivo precisa ser PDF (a prefeitura não aceita imagem nem Word). Digitalize como PDF.");
  }
  const signatures = readPdfSignatures(file.buffer);
  const monthly = SIGN_RULES[data.type].monthly;
  const key = { studentId: student.id, type: data.type, year: monthly ? data.year : null, month: monthly ? data.month : null };
  const doc = await prisma.$transaction(async (tx) => {
    await tx.signedDocument.deleteMany({ where: key });
    return tx.signedDocument.create({
      data: {
        ...key,
        unitId: student.unitId,
        fileName: file.originalname || `${SIGN_RULES[data.type].label}.pdf`,
        size: file.size,
        data: file.buffer,
        method: signatures.length ? "DIGITAL" : "PAPEL",
        signatures: signatures as never,
        uploadedById: req.user!.id,
      },
      select: { id: true, method: true, signatures: true },
    });
  });
  res.status(201).json(doc);
}));

signaturesRouter.get("/:id/file", asyncHandler(async (req, res) => {
  const doc = await prisma.signedDocument.findUniqueOrThrow({ where: { id: req.params.id } });
  assertUnitAccess(req.user!, doc.unitId);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(doc.fileName)}"`);
  res.send(Buffer.from(doc.data));
}));

signaturesRouter.delete("/:id", asyncHandler(async (req, res) => {
  const doc = await prisma.signedDocument.findUniqueOrThrow({ where: { id: req.params.id }, select: { id: true, unitId: true } });
  assertUnitAccess(req.user!, doc.unitId);
  await prisma.signedDocument.delete({ where: { id: doc.id } });
  res.status(204).end();
}));

/**
 * Os anexos assinados de um tipo, todas as crianças juntas em ordem
 * alfabética num PDF só — o arquivo que vai para a prefeitura. Ao juntar,
 * a assinatura digital de cada arquivo deixa de ser verificável no arquivo
 * junto (fica a marca visual); os originais continuam guardados aqui.
 */
signaturesRouter.get("/merged/:type", asyncHandler(async (req, res) => {
  const type = z.enum(DOC_TYPES as [SignedDocType, ...SignedDocType[]]).parse(req.params.type);
  const { unitId, year, month } = monthQuery(req.query);
  assertUnitAccess(req.user!, unitId);
  const status = await loadSignatureStatus(unitId, year, month);
  const ids = status.rows.flatMap((r) => r.items.filter((i) => i.type === type && i.doc).map((i) => i.doc!.id));
  if (ids.length === 0) throw new HttpError(400, `Nenhum ${SIGN_RULES[type].label} assinado enviado para esse mês`);
  const docs = await prisma.signedDocument.findMany({ where: { id: { in: ids } }, select: { id: true, data: true, student: { select: { name: true } } } });
  const byId = new Map(docs.map((d) => [d.id, d]));
  const merged = await PDFDocument.create();
  const failed: string[] = [];
  for (const id of ids) {
    const d = byId.get(id)!;
    try {
      const src = await PDFDocument.load(d.data, { ignoreEncryption: true });
      for (const page of await merged.copyPages(src, src.getPageIndices())) merged.addPage(page);
    } catch {
      failed.push(d.student.name);
    }
  }
  if (merged.getPageCount() === 0) throw new HttpError(400, "Não foi possível abrir os PDFs enviados");
  const missing = status.rows.filter((r) => r.items.some((i) => i.type === type && !i.doc)).length;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(`ANEXO ${SIGN_RULES[type].number}.pdf`)}"`);
  res.setHeader("X-Faltando", String(missing));
  if (failed.length) res.setHeader("X-Nao-Abriram", encodeURIComponent(failed.join(", ")));
  res.send(Buffer.from(await merged.save()));
}));
