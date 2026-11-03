import { describe, expect, it } from "vitest";
import { evaluateDoc, isRequired, whatsappLink } from "./signatureRules";
import type { PdfSignature } from "./pdfSignatures";

const guardian = { name: "Carla Souza", cpf: "999.888.777-66" };
const school = { name: "Maria Representante", cpf: "123.456.789-00" };
const sig = (name: string, cpf: string | null, integrity: PdfSignature["integrity"] = "ok"): PdfSignature => ({ name, cpf, signedAt: null, integrity });

describe("quem falta assinar", () => {
  it("papel conta como completo", () => {
    expect(evaluateDoc("ANEXO_I", { method: "PAPEL", signatures: [] }, guardian, school)).toEqual({ complete: true, missing: [], altered: false });
  });
  it("Anexo I digital precisa do responsável e da escola", () => {
    const onlyGuardian = evaluateDoc("ANEXO_I", { method: "DIGITAL", signatures: [sig("CARLA SOUZA", "99988877766")] }, guardian, school);
    expect(onlyGuardian).toMatchObject({ complete: false, missing: ["escola"] });
    const both = evaluateDoc(
      "ANEXO_I",
      { method: "DIGITAL", signatures: [sig("CARLA SOUZA", "99988877766"), sig("MARIA REPRESENTANTE", "12345678900")] },
      guardian,
      school
    );
    expect(both.complete).toBe(true);
  });
  it("Anexo III só precisa da escola; Anexo II só do responsável", () => {
    expect(evaluateDoc("ANEXO_III", { method: "DIGITAL", signatures: [sig("X", "12345678900")] }, guardian, school).complete).toBe(true);
    expect(evaluateDoc("ANEXO_II", { method: "DIGITAL", signatures: [sig("X", "12345678900")] }, guardian, school).missing).toEqual(["responsável"]);
  });
  it("PDF alterado depois de assinado não vale", () => {
    const r = evaluateDoc("ANEXO_II", { method: "DIGITAL", signatures: [sig("CARLA", "99988877766", "alterado")] }, guardian, school);
    expect(r).toMatchObject({ complete: false, altered: true });
  });
  it("Anexo V só para quem recebeu material", () => {
    expect(isRequired("ANEXO_V", { materialDeliveredAt: null })).toBe(false);
    expect(isRequired("ANEXO_V", { materialDeliveredAt: new Date() })).toBe(true);
    expect(isRequired("ANEXO_I", { materialDeliveredAt: null })).toBe(true);
  });
});

it("link do WhatsApp", () => {
  expect(whatsappLink("(21) 99999-0000", "Oi")).toBe("https://wa.me/5521999990000?text=Oi");
  expect(whatsappLink("123", "Oi")).toBeNull();
  expect(whatsappLink(null, "Oi")).toBeNull();
});
