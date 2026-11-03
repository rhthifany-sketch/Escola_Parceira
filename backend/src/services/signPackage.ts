import { PDFDocument } from "pdf-lib";
import type { SignedDocType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { HttpError } from "../lib/http";
import { DOC_TYPES, SIGN_RULES } from "../lib/signatureRules";
import { createDoc, downloadSignedFile, getDoc, requestStatus, type NewSigner } from "../lib/zapsign";
import { loadMonth } from "../documents/monthData";
import { anexoPdfByType } from "../documents/byType";
import { loadSignatureStatus, type RequestSigner } from "./signatureStatus";

/**
 * Pacote de assinatura: TODOS os anexos pendentes de uma criança num
 * documento só da ZapSign — o responsável recebe um link e assina uma vez.
 * Quando volta assinado, cada anexo é separado (as páginas dele + o
 * relatório de assinaturas da ZapSign) e o original completo fica no pedido.
 */

type PageMap = Partial<Record<SignedDocType, [number, number]>>;

export interface PackageOptions {
  /** criado pelo envio automático do mês */
  auto?: boolean;
  /** a ZapSign manda o convite pelo WhatsApp do responsável */
  whatsapp?: boolean;
  /** só esses anexos (padrão: todos os pendentes sem pedido aberto) */
  types?: SignedDocType[];
}

/** Monta o PDF do pacote (anexos na ordem I→V) e o mapa de páginas. */
export async function buildPackagePdf(unitId: string, studentId: string, year: number, month: number, types: SignedDocType[]) {
  const data = await loadMonth(unitId, year, month);
  data.rows = data.rows.filter((r) => r.student.id === studentId);
  if (!data.rows.length) throw new HttpError(400, "Essa criança não está matriculada nesse mês");
  const ordered = DOC_TYPES.filter((t) => types.includes(t));
  const merged = await PDFDocument.create();
  const pageMap: PageMap = {};
  for (const type of ordered) {
    const src = await PDFDocument.load(await anexoPdfByType(type, data));
    pageMap[type] = [merged.getPageCount(), src.getPageCount()];
    for (const page of await merged.copyPages(src, src.getPageIndices())) merged.addPage(page);
  }
  return { pdf: Buffer.from(await merged.save()), pageMap, types: ordered, unit: data.unit, student: data.rows[0].student };
}

/** Cria o pedido (pacote) na ZapSign para uma criança no mês. */
export async function createPackage(studentId: string, year: number, month: number, opts: PackageOptions = {}) {
  const student = await prisma.student.findUniqueOrThrow({ where: { id: studentId } });
  const { rows } = await loadSignatureStatus(student.unitId, year, month);
  const row = rows.find((r) => r.studentId === studentId);
  if (!row) throw new HttpError(400, "Essa criança não está matriculada nesse mês");
  const types = (opts.types ?? row.toRequest).filter((t) => row.items.some((i) => i.type === t && !i.complete));
  if (!types.length) throw new HttpError(400, "Nada pendente para assinar dessa criança (ou já existe um pedido aberto)");
  const needsGuardian = types.some((t) => SIGN_RULES[t].guardian);
  const needsSchool = types.some((t) => SIGN_RULES[t].school);
  if (needsGuardian && !student.guardianName) throw new HttpError(400, "Cadastre o nome do responsável antes (Crianças → Editar)");
  if (opts.whatsapp && needsGuardian && !student.guardianPhone) throw new HttpError(400, "Cadastre o WhatsApp do responsável antes (Crianças → Editar)");

  const pkg = await buildPackagePdf(student.unitId, studentId, year, month, types);
  const wanted: NewSigner[] = [
    ...(needsGuardian ? [{ role: "responsável" as const, name: student.guardianName!, phone: student.guardianPhone, sendWhatsapp: !!opts.whatsapp }] : []),
    ...(needsSchool ? [{ role: "escola" as const, name: pkg.unit.legalRepName, phone: null }] : []),
  ];
  const mm = `${String(month).padStart(2, "0")}/${year}`;
  const doc = await createDoc({
    name: `Documentos da bolsa - ${student.name} - ${mm} (${pkg.types.map((t) => SIGN_RULES[t].label.replace("Anexo ", "")).join(", ")})`,
    pdf: pkg.pdf,
    externalId: `${student.id}:${year}-${month}`,
    signers: wanted,
  });
  const signers: RequestSigner[] = wanted.map((w, i) => {
    const z = doc.signers.find((s) => s.external_id === w.role) ?? doc.signers[i];
    return { role: w.role, name: w.name, url: z?.sign_url ?? "", status: z?.status ?? "new", signedAt: z?.signed_at ?? null };
  });
  if (signers.some((s) => !s.url)) throw new HttpError(502, "A ZapSign não devolveu os links de assinatura");
  return prisma.signRequest.create({
    data: {
      unitId: student.unitId,
      studentId,
      types: pkg.types,
      year,
      month,
      pageMap: pkg.pageMap as never,
      externalId: doc.token,
      signers: signers as never,
      auto: !!opts.auto,
      whatsapp: !!opts.whatsapp && needsGuardian && !!student.guardianPhone,
    },
  });
}

/**
 * Separa o PDF assinado em um arquivo por anexo: as páginas do anexo + as
 * páginas que a ZapSign acrescenta no fim (relatório de assinaturas).
 */
export async function splitSignedPackage(signed: Buffer, pageMap: PageMap) {
  const src = await PDFDocument.load(signed, { ignoreEncryption: true });
  const total = src.getPageCount();
  const generated = Object.values(pageMap).reduce((n, v) => Math.max(n, v![0] + v![1]), 0);
  const report = total > generated ? Array.from({ length: total - generated }, (_v, i) => generated + i) : [];
  const out: Partial<Record<SignedDocType, Buffer>> = {};
  for (const [type, range] of Object.entries(pageMap) as [SignedDocType, [number, number]][]) {
    if (total < generated) {
      out[type] = signed; // a ZapSign mudou o número de páginas: guarda o pacote inteiro
      continue;
    }
    const doc = await PDFDocument.create();
    const pages = [...Array.from({ length: range[1] }, (_v, i) => range[0] + i), ...report];
    for (const page of await doc.copyPages(src, pages)) doc.addPage(page);
    out[type] = Buffer.from(await doc.save());
  }
  return out;
}

/** Busca na ZapSign quem já assinou; quando todos assinaram, guarda os anexos assinados. */
export async function refreshRequest(id: string, userId: string | null) {
  const r = await prisma.signRequest.findUniqueOrThrow({ where: { id } });
  if (r.status === "ASSINADO") return r;
  const doc = await getDoc(r.externalId);
  const old = r.signers as unknown as RequestSigner[];
  const signers = old.map((s, i) => {
    const z = doc.signers.find((x) => x.external_id === s.role) ?? doc.signers[i];
    return z ? { ...s, status: z.status, signedAt: z.signed_at ?? null, url: z.sign_url || s.url } : s;
  });
  const status = requestStatus(doc);
  if (status !== "ASSINADO" || !doc.signed_file) {
    // ainda pendente (ou a ZapSign ainda está gerando o PDF final)
    return prisma.signRequest.update({ where: { id }, data: { status: status === "ASSINADO" ? "PENDENTE" : status, signers: signers as never } });
  }
  const file = await downloadSignedFile(doc.signed_file);
  const parts = await splitSignedPackage(file, r.pageMap as PageMap);
  const student = await prisma.student.findUniqueOrThrow({ where: { id: r.studentId } });
  const signatures = signers.map((s) => ({ name: s.name, cpf: null, signedAt: s.signedAt, integrity: "ok", role: s.role }));
  return prisma.$transaction(async (tx) => {
    for (const type of r.types) {
      const data = parts[type];
      if (!data) continue;
      const monthly = SIGN_RULES[type].monthly;
      const key = { studentId: r.studentId, type, year: monthly ? r.year : null, month: monthly ? r.month : null };
      await tx.signedDocument.deleteMany({ where: key });
      await tx.signedDocument.create({
        data: {
          ...key,
          unitId: r.unitId,
          fileName: `${SIGN_RULES[type].label} - ${student.name} (ZapSign).pdf`,
          size: data.length,
          data,
          method: "PLATAFORMA",
          signatures: signatures as never,
          uploadedById: userId,
          requestId: r.id,
        },
      });
    }
    return tx.signRequest.update({ where: { id }, data: { status, signers: signers as never, signedFile: file, completedAt: new Date() } });
  });
}

export interface SendSummary {
  sent: number;
  skipped: { unit: string; student: string; reason: string }[];
  errors: { unit: string; student: string; error: string }[];
}

/** Cria os pacotes de todas as crianças com pendência de uma unidade no mês. */
export async function sendUnit(unitId: string, year: number, month: number, opts: PackageOptions, summary: SendSummary) {
  const { unit, rows } = await loadSignatureStatus(unitId, year, month);
  for (const row of rows) {
    if (!row.toRequest.length) continue;
    const needsGuardian = row.toRequest.some((t) => SIGN_RULES[t].guardian);
    if (needsGuardian && !row.guardianName) {
      summary.skipped.push({ unit: unit.name, student: row.name, reason: "sem responsável cadastrado" });
      continue;
    }
    if (opts.whatsapp && needsGuardian && !row.guardianPhone) {
      summary.skipped.push({ unit: unit.name, student: row.name, reason: "sem WhatsApp do responsável" });
      continue;
    }
    try {
      await createPackage(row.studentId, year, month, opts);
      summary.sent++;
    } catch (err) {
      summary.errors.push({ unit: unit.name, student: row.name, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return summary;
}

/** Atualiza os pedidos abertos (todos, ou de uma unidade). */
export async function refreshOpen(where: { unitId?: string } = {}) {
  const open = await prisma.signRequest.findMany({ where: { ...where, status: "PENDENTE" }, select: { id: true } });
  let signed = 0;
  const errors: string[] = [];
  for (const { id } of open) {
    try {
      if ((await refreshRequest(id, null)).status === "ASSINADO") signed++;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return { checked: open.length, signed, errors: [...new Set(errors)] };
}
