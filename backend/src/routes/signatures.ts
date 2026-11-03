import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { PDFDocument } from "pdf-lib";
import type { SignedDocType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { HttpError, asyncHandler } from "../lib/http";
import { assertUnitAccess } from "../lib/auth";
import { readPdfSignatures } from "../lib/pdfSignatures";
import { DOC_TYPES, SIGN_RULES } from "../lib/signatureRules";
import { zapsignEnabled, zapsignIsSandbox } from "../lib/zapsign";
import { loadSignatureStatus } from "../services/signatureStatus";
import { createPackage, refreshOpen, refreshRequest, sendUnit, type SendSummary } from "../services/signPackage";

export const signaturesRouter = Router();
const MAX_MB = 10;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_MB * 1024 * 1024 } });

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
  res.json({ rows, maxMb: MAX_MB, zapsign: zapsignEnabled() ? { sandbox: zapsignIsSandbox() } : null });
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
 * alfabética num PDF só — o arquivo que vai para a prefeitura.
 * Juntar cria um arquivo novo, então o selo da assinatura não vale para as
 * páginas juntadas; por isso cada PDF original assinado vai ANEXADO dentro
 * do arquivo (painel de anexos do leitor de PDF), byte a byte igual ao que
 * foi assinado — a assinatura de cada um continua conferível.
 */
signaturesRouter.get("/merged/:type", asyncHandler(async (req, res) => {
  const type = z.enum(DOC_TYPES as [SignedDocType, ...SignedDocType[]]).parse(req.params.type);
  const { unitId, year, month } = monthQuery(req.query);
  assertUnitAccess(req.user!, unitId);
  const status = await loadSignatureStatus(unitId, year, month);
  const ids = status.rows.flatMap((r) => r.items.filter((i) => i.type === type && i.doc).map((i) => i.doc!.id));
  if (ids.length === 0) throw new HttpError(400, `Nenhum ${SIGN_RULES[type].label} assinado enviado para esse mês`);
  const docs = await prisma.signedDocument.findMany({
    where: { id: { in: ids } },
    select: { id: true, data: true, uploadedAt: true, requestId: true, student: { select: { name: true } } },
  });
  // assinado pela ZapSign: o original anexado é o pacote completo, com o selo dela
  const packages = new Map(
    (await prisma.signRequest.findMany({ where: { id: { in: docs.flatMap((d) => (d.requestId ? [d.requestId] : [])) } }, select: { id: true, signedFile: true } }))
      .filter((r) => r.signedFile)
      .map((r) => [r.id, Buffer.from(r.signedFile!)])
  );
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
    // o original assinado, intacto, dentro do arquivo
    const label = SIGN_RULES[type].label;
    const original = (d.requestId && packages.get(d.requestId)) || d.data;
    const isPackage = original !== d.data;
    await merged.attach(original, `${label} - ${d.student.name} (original assinado${isPackage ? ", todos os documentos" : ""}).pdf`, {
      mimeType: "application/pdf",
      description: isPackage
        ? `Documentos da bolsa de ${d.student.name} assinados juntos na ZapSign (inclui o ${label}) — original, sem alteração`
        : `${label} de ${d.student.name} — arquivo original assinado, sem alteração`,
      creationDate: d.uploadedAt,
      modificationDate: d.uploadedAt,
    });
  }
  if (merged.getPageCount() === 0) throw new HttpError(400, "Não foi possível abrir os PDFs enviados");
  const missing = status.rows.filter((r) => r.items.some((i) => i.type === type && !i.doc)).length;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(`ANEXO ${SIGN_RULES[type].number}.pdf`)}"`);
  res.setHeader("X-Faltando", String(missing));
  if (failed.length) res.setHeader("X-Nao-Abriram", encodeURIComponent(failed.join(", ")));
  res.send(Buffer.from(await merged.save()));
}));


// ---------------- ZapSign: um pacote por criança ----------------

const packageSchema = z.object({
  studentId: z.string().min(1),
  year: z.coerce.number().int().min(2000),
  month: z.coerce.number().int().min(1).max(12),
  whatsapp: z.boolean().optional(),
});

function requireZapsign() {
  if (!zapsignEnabled()) throw new HttpError(400, "ZapSign não configurada no servidor (ZAPSIGN_API_TOKEN)");
}

/** Todos os anexos pendentes da criança num documento só da ZapSign. */
signaturesRouter.post("/zapsign/package", asyncHandler(async (req, res) => {
  requireZapsign();
  const data = packageSchema.parse(req.body);
  const student = await prisma.student.findUniqueOrThrow({ where: { id: data.studentId }, select: { unitId: true } });
  assertUnitAccess(req.user!, student.unitId);
  res.status(201).json(await createPackage(data.studentId, data.year, data.month, { whatsapp: data.whatsapp }));
}));

/** Cria os pacotes de todas as crianças com pendência da unidade no mês. */
signaturesRouter.post("/zapsign/send-unit", asyncHandler(async (req, res) => {
  requireZapsign();
  const { unitId, year, month } = monthQuery(req.body ?? {});
  assertUnitAccess(req.user!, unitId);
  const summary: SendSummary = { sent: 0, skipped: [], errors: [] };
  await sendUnit(unitId, year, month, { whatsapp: !!req.body?.whatsapp }, summary);
  res.json(summary);
}));

signaturesRouter.post("/zapsign/:id/refresh", asyncHandler(async (req, res) => {
  requireZapsign();
  const r = await prisma.signRequest.findUniqueOrThrow({ where: { id: req.params.id }, select: { unitId: true } });
  assertUnitAccess(req.user!, r.unitId);
  const updated = await refreshRequest(req.params.id, req.user!.id);
  res.json({ id: updated.id, status: updated.status });
}));

/** Atualiza todos os pedidos abertos da unidade. */
signaturesRouter.post("/zapsign/refresh", asyncHandler(async (req, res) => {
  requireZapsign();
  const { unitId } = monthQuery(req.body ?? {});
  assertUnitAccess(req.user!, unitId);
  res.json(await refreshOpen({ unitId }));
}));

signaturesRouter.delete("/zapsign/:id", asyncHandler(async (req, res) => {
  const r = await prisma.signRequest.findUniqueOrThrow({ where: { id: req.params.id }, select: { id: true, unitId: true } });
  assertUnitAccess(req.user!, r.unitId);
  await prisma.signRequest.delete({ where: { id: r.id } });
  res.status(204).end();
}));

/**
 * Aviso da ZapSign (webhook) quando alguém assina. Não confia no conteúdo:
 * só usa o token do documento para conferir direto na API da ZapSign.
 */
export const zapsignWebhookRouter = Router();
zapsignWebhookRouter.post("/", asyncHandler(async (req, res) => {
  const token = String(req.body?.token ?? req.body?.doc_token ?? req.body?.document?.token ?? "");
  if (token && zapsignEnabled()) {
    const r = await prisma.signRequest.findFirst({ where: { externalId: token, status: { not: "ASSINADO" } }, select: { id: true } });
    if (r) await refreshRequest(r.id, null).catch((err) => console.error("webhook ZapSign:", err));
  }
  res.json({ ok: true });
}));
