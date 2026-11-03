import type { SignMethod, SignedDocType } from "@prisma/client";
import { signedBy, type PdfSignature } from "./pdfSignatures";

/**
 * Quem assina cada anexo e com que frequência (modelos FME 2026).
 * Anexo I é todo mês; II a V são assinados uma vez e reenviados todo mês.
 */
export const SIGN_RULES: Record<SignedDocType, { label: string; number: number; guardian: boolean; school: boolean; monthly: boolean }> = {
  ANEXO_I: { label: "Anexo I", number: 1, guardian: true, school: true, monthly: true },
  ANEXO_II: { label: "Anexo II", number: 2, guardian: true, school: false, monthly: false },
  ANEXO_III: { label: "Anexo III", number: 3, guardian: false, school: true, monthly: false },
  ANEXO_IV: { label: "Anexo IV", number: 4, guardian: true, school: true, monthly: false },
  ANEXO_V: { label: "Anexo V", number: 5, guardian: true, school: false, monthly: false },
};

export const DOC_TYPES = Object.keys(SIGN_RULES) as SignedDocType[];

export interface Person {
  name: string | null;
  cpf: string | null;
}

export interface DocEvaluation {
  complete: boolean;
  /** Quem ainda falta assinar (só para PDF digital). */
  missing: ("responsável" | "escola")[];
  /** Algum PDF digital foi alterado depois de assinado. */
  altered: boolean;
}

/**
 * Papel (assinado à mão e digitalizado): a escola atesta ao enviar, conta
 * como completo. Digital: confere pelas assinaturas lidas do PDF se o
 * responsável e o representante da escola assinaram.
 */
export function evaluateDoc(
  type: SignedDocType,
  doc: { method: SignMethod; signatures: PdfSignature[] },
  guardian: Person,
  school: Person
): DocEvaluation {
  const rule = SIGN_RULES[type];
  const altered = doc.signatures.some((s) => s.integrity === "alterado");
  if (doc.method === "PAPEL") return { complete: !altered, missing: [], altered };
  const valid = doc.signatures.filter((s) => s.integrity !== "alterado");
  const missing: DocEvaluation["missing"] = [];
  if (rule.guardian && !valid.some((s) => signedBy(s, guardian))) missing.push("responsável");
  if (rule.school && !valid.some((s) => signedBy(s, school))) missing.push("escola");
  return { complete: missing.length === 0 && !altered, missing, altered };
}

/** Anexo V só é exigido de quem recebeu material e uniforme. */
export const isRequired = (type: SignedDocType, student: { materialDeliveredAt: Date | null }) =>
  type !== "ANEXO_V" || student.materialDeliveredAt !== null;

/** Mensagem do WhatsApp para chamar o responsável. */
export function whatsappMessage(opts: { guardianName: string | null; studentName: string; unitName: string; pending: string[]; monthLabel: string }) {
  const first = opts.guardianName?.trim().split(/\s+/)[0];
  return (
    `Olá${first ? `, ${first}` : ""}! Aqui é da ${opts.unitName}. ` +
    `Precisamos da sua assinatura nos documentos da bolsa da Prefeitura de Niterói de ${opts.studentName} ` +
    `(${opts.pending.join(", ")} – referente a ${opts.monthLabel}). ` +
    `Por favor, passe na secretaria da escola para assinar. Obrigado!`
  );
}

/** Link do WhatsApp com a mensagem pronta (número brasileiro). */
export function whatsappLink(phone: string | null, message: string): string | null {
  let digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  if (digits.length < 12) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
