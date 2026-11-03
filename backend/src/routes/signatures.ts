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
import { anexoPdfByType } from "../documents/byType";
import { createDoc, downloadSignedFile, getDoc, requestStatus, zapsignEnabled, zapsignIsSandbox } from "../lib/zapsign";

interface RequestSigner {
  role: "responsável" | "escola";
  name: string;
  url: string;
  status: string;
  signedAt: string | null;
}

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
  // pedidos de assinatura pela plataforma ainda abertos
  const requests = await prisma.signRequest.findMany({
    where: {
      studentId: { in: ids },
      status: { not: "ASSINADO" },
      OR: [{ type: "ANEXO_I", year, month }, { type: { not: "ANEXO_I" } }],
    },
    orderBy: { createdAt: "desc" },
  });
  const openRequest = new Map<string, (typeof requests)[number]>();
  for (const r of requests) if (!openRequest.has(`${r.studentId}|${r.type}`)) openRequest.set(`${r.studentId}|${r.type}`, r);

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
        request: (() => {
          const r = evaluation?.complete ? null : openRequest.get(`${student.id}|${type}`);
          return r ? { id: r.id, status: r.status, createdAt: r.createdAt, signers: r.signers as unknown as RequestSigner[] } : null;
        })(),
      };
    });
    const pendingFromGuardian = items.filter((i) => !i.complete && i.needsGuardian).map((i) => i.label);
    const signLinks = items
      .filter((i) => !i.complete && i.request?.status === "PENDENTE")
      .flatMap((i) => i.request!.signers.filter((s) => s.role === "responsável" && s.status !== "signed").map((s) => ({ label: i.label, url: s.url })));
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
            whatsappMessage({ guardianName: student.guardianName, studentName: student.name, unitName: data.unit.name, pending: pendingFromGuardian, monthLabel, signLinks })
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
  const docs = await prisma.signedDocument.findMany({ where: { id: { in: ids } }, select: { id: true, data: true, uploadedAt: true, student: { select: { name: true } } } });
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
    await merged.attach(d.data, `${label} - ${d.student.name} (original assinado).pdf`, {
      mimeType: "application/pdf",
      description: `${label} de ${d.student.name} — arquivo original assinado, sem alteração`,
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

// ---------------- ZapSign (assinatura pelo celular) ----------------

const requestSchema = uploadSchema;

/** Cria o documento na ZapSign e guarda os links de assinatura. */
signaturesRouter.post("/zapsign", asyncHandler(async (req, res) => {
  if (!zapsignEnabled()) throw new HttpError(400, "ZapSign não configurada no servidor");
  const data = requestSchema.parse(req.body);
  const student = await prisma.student.findUniqueOrThrow({ where: { id: data.studentId } });
  assertUnitAccess(req.user!, student.unitId);
  const rule = SIGN_RULES[data.type];
  if (!isRequired(data.type, student)) throw new HttpError(400, "Essa criança não tem entrega de material registrada (Anexo V)");
  if (rule.guardian && !student.guardianName) throw new HttpError(400, "Cadastre o nome do responsável antes (Crianças → Editar)");

  const month = await loadMonth(student.unitId, data.year, data.month);
  month.rows = month.rows.filter((r) => r.student.id === student.id);
  if (!month.rows.length) throw new HttpError(400, "Essa criança não está matriculada nesse mês");
  const pdf = await anexoPdfByType(data.type, month);

  const wanted = [
    ...(rule.guardian ? [{ role: "responsável" as const, name: student.guardianName!, phone: student.guardianPhone }] : []),
    ...(rule.school ? [{ role: "escola" as const, name: month.unit.legalRepName, phone: null }] : []),
  ];
  const doc = await createDoc({
    name: `${rule.label} - ${student.name}${rule.monthly ? ` - ${String(data.month).padStart(2, "0")}/${data.year}` : ""}`,
    pdf,
    externalId: `${student.id}:${data.type}:${data.year}-${data.month}`,
    signers: wanted,
  });
  const signers: RequestSigner[] = wanted.map((w, i) => {
    const z = doc.signers.find((s) => s.external_id === w.role) ?? doc.signers[i];
    return { role: w.role, name: w.name, url: z?.sign_url ?? "", status: z?.status ?? "new", signedAt: z?.signed_at ?? null };
  });
  if (signers.some((s) => !s.url)) throw new HttpError(502, "A ZapSign não devolveu os links de assinatura");

  const key = { studentId: student.id, type: data.type, year: rule.monthly ? data.year : null, month: rule.monthly ? data.month : null };
  const created = await prisma.$transaction(async (tx) => {
    await tx.signRequest.deleteMany({ where: { ...key, status: { not: "ASSINADO" } } });
    return tx.signRequest.create({ data: { ...key, unitId: student.unitId, externalId: doc.token, signers: signers as never } });
  });
  res.status(201).json(created);
}));

/** Busca na ZapSign quem já assinou; quando todos assinaram, guarda o PDF assinado. */
async function refreshRequest(id: string, userId: string) {
  const r = await prisma.signRequest.findUniqueOrThrow({ where: { id } });
  if (r.status === "ASSINADO") return r;
  const doc = await getDoc(r.externalId);
  const old = r.signers as unknown as RequestSigner[];
  const signers = old.map((s, i) => {
    const z = doc.signers.find((x) => x.external_id === s.role) ?? doc.signers[i];
    return z ? { ...s, status: z.status, signedAt: z.signed_at ?? null, url: z.sign_url || s.url } : s;
  });
  const status = requestStatus(doc);
  if (status === "ASSINADO") {
    if (!doc.signed_file) {
      // a ZapSign ainda está gerando o PDF final
      return prisma.signRequest.update({ where: { id }, data: { signers: signers as never } });
    }
    const file = await downloadSignedFile(doc.signed_file);
    const student = await prisma.student.findUniqueOrThrow({ where: { id: r.studentId } });
    const docKey = { studentId: r.studentId, type: r.type, year: r.year, month: r.month };
    return prisma.$transaction(async (tx) => {
      await tx.signedDocument.deleteMany({ where: docKey });
      await tx.signedDocument.create({
        data: {
          ...docKey,
          unitId: r.unitId,
          fileName: `${SIGN_RULES[r.type].label} - ${student.name} (ZapSign).pdf`,
          size: file.length,
          data: file,
          method: "PLATAFORMA",
          signatures: signers.map((s) => ({ name: s.name, cpf: null, signedAt: s.signedAt, integrity: "ok", role: s.role })) as never,
          uploadedById: userId,
        },
      });
      return tx.signRequest.update({ where: { id }, data: { status, signers: signers as never, completedAt: new Date() } });
    });
  }
  return prisma.signRequest.update({ where: { id }, data: { status, signers: signers as never } });
}

signaturesRouter.post("/zapsign/:id/refresh", asyncHandler(async (req, res) => {
  const r = await prisma.signRequest.findUniqueOrThrow({ where: { id: req.params.id }, select: { unitId: true } });
  assertUnitAccess(req.user!, r.unitId);
  res.json(await refreshRequest(req.params.id, req.user!.id));
}));

/** Atualiza todos os pedidos abertos das crianças da unidade no mês. */
signaturesRouter.post("/zapsign/refresh", asyncHandler(async (req, res) => {
  const { unitId, year, month } = monthQuery(req.body ?? {});
  assertUnitAccess(req.user!, unitId);
  const { rows } = await loadSignatureStatus(unitId, year, month);
  const ids = rows.flatMap((r) => r.items.filter((i) => i.request?.status === "PENDENTE").map((i) => i.request!.id));
  let signed = 0;
  const errors: string[] = [];
  for (const id of ids) {
    try {
      if ((await refreshRequest(id, req.user!.id)).status === "ASSINADO") signed++;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  res.json({ checked: ids.length, signed, errors: [...new Set(errors)] });
}));

signaturesRouter.delete("/zapsign/:id", asyncHandler(async (req, res) => {
  const r = await prisma.signRequest.findUniqueOrThrow({ where: { id: req.params.id }, select: { id: true, unitId: true } });
  assertUnitAccess(req.user!, r.unitId);
  await prisma.signRequest.delete({ where: { id: r.id } });
  res.status(204).end();
}));
