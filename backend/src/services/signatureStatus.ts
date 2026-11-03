import { prisma } from "../lib/prisma";
import { MONTH_NAMES } from "../lib/month";
import type { PdfSignature } from "../lib/pdfSignatures";
import { DOC_TYPES, SIGN_RULES, evaluateDoc, isRequired, whatsappLink, whatsappMessage } from "../lib/signatureRules";
import { loadMonth } from "../documents/monthData";

export interface RequestSigner {
  role: "responsável" | "escola";
  name: string;
  url: string;
  status: string;
  signedAt: string | null;
}

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

  // pedidos da ZapSign ainda abertos (o Anexo I só vale o pacote do próprio mês)
  const requests = await prisma.signRequest.findMany({
    where: { studentId: { in: ids }, status: { not: "ASSINADO" } },
    select: { id: true, studentId: true, types: true, year: true, month: true, status: true, createdAt: true, signers: true, auto: true, whatsapp: true },
    orderBy: { createdAt: "desc" },
  });
  const openFor = (studentId: string, type: (typeof DOC_TYPES)[number]) =>
    requests.find((r) => r.studentId === studentId && r.types.includes(type) && (type !== "ANEXO_I" || (r.year === year && r.month === month)));

  const school = { name: data.unit.legalRepName, cpf: data.unit.legalRepCpf };
  const monthLabel = `${MONTH_NAMES[month - 1]}/${year}`;
  const rows = data.rows.map(({ student }) => {
    const guardian = { name: student.guardianName, cpf: student.guardianCpf };
    const items = DOC_TYPES.filter((t) => isRequired(t, student)).map((type) => {
      const doc = latest.get(`${student.id}|${type}`);
      const evaluation = doc ? evaluateDoc(type, { method: doc.method, signatures: doc.signatures as unknown as PdfSignature[] }, guardian, school) : null;
      const r = evaluation?.complete ? undefined : openFor(student.id, type);
      return {
        type,
        label: SIGN_RULES[type].label,
        needsGuardian: SIGN_RULES[type].guardian,
        needsSchool: SIGN_RULES[type].school,
        doc: doc
          ? {
              id: doc.id,
              fileName: doc.fileName,
              method: doc.method,
              signatures: doc.signatures,
              uploadedAt: doc.uploadedAt,
              uploadedBy: doc.uploadedBy?.name ?? null,
            }
          : null,
        complete: evaluation?.complete ?? false,
        missing: evaluation?.missing ?? [],
        altered: evaluation?.altered ?? false,
        request: r ? { id: r.id, status: r.status, createdAt: r.createdAt, signers: r.signers as unknown as RequestSigner[], types: r.types } : null,
      };
    });
    const pending = items.filter((i) => !i.complete);
    // pacote aberto que cobre as pendências (o mais recente)
    const openRequests = [...new Map(pending.filter((i) => i.request).map((i) => [i.request!.id, i.request!])).values()];
    const pendingFromGuardian = pending.filter((i) => i.needsGuardian).map((i) => i.label);
    const guardianLinks = openRequests
      .filter((r) => r.status === "PENDENTE")
      .flatMap((r) => r.signers.filter((s) => s.role === "responsável" && s.status !== "signed").map((s) => s.url));
    const signLinks = [...new Set(guardianLinks)].map((url) => ({ label: "Documentos da bolsa", url }));
    return {
      studentId: student.id,
      name: student.name,
      guardianName: student.guardianName,
      guardianPhone: student.guardianPhone,
      complete: items.every((i) => i.complete),
      items,
      /** anexos ainda sem assinatura completa e sem pedido aberto — vão no próximo pacote */
      toRequest: pending.filter((i) => !i.request).map((i) => i.type),
      openRequests,
      whatsapp: pendingFromGuardian.length
        ? whatsappLink(
            student.guardianPhone,
            whatsappMessage({
              guardianName: student.guardianName,
              studentName: student.name,
              unitName: data.unit.name,
              pending: pendingFromGuardian,
              monthLabel,
              signLinks,
            })
          )
        : null,
    };
  });
  return { unit: data.unit, rows };
}
