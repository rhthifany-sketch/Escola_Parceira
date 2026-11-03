import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { splitSignedPackage } from "./signPackage";

/** PDF com N páginas, cada uma com largura diferente para identificar. */
async function pdfWith(widths: number[]) {
  const doc = await PDFDocument.create();
  for (const w of widths) doc.addPage([w, 800]);
  return Buffer.from(await doc.save());
}
const widthsOf = async (b: Buffer) => (await PDFDocument.load(b)).getPages().map((p) => p.getWidth());

describe("separar o pacote assinado", () => {
  it("cada anexo leva as páginas dele + o relatório de assinaturas do fim", async () => {
    // pacote: Anexo I (1 pág), II (1), IV (2) + 1 página de relatório da ZapSign
    const signed = await pdfWith([101, 102, 104, 105, 999]);
    const parts = await splitSignedPackage(signed, { ANEXO_I: [0, 1], ANEXO_II: [1, 1], ANEXO_IV: [2, 2] });
    expect(await widthsOf(parts.ANEXO_I!)).toEqual([101, 999]);
    expect(await widthsOf(parts.ANEXO_II!)).toEqual([102, 999]);
    expect(await widthsOf(parts.ANEXO_IV!)).toEqual([104, 105, 999]);
  });
  it("se vier com menos páginas que o enviado, guarda o pacote inteiro", async () => {
    const signed = await pdfWith([101]);
    const parts = await splitSignedPackage(signed, { ANEXO_I: [0, 1], ANEXO_II: [1, 1] });
    expect(parts.ANEXO_II).toBe(signed);
  });
});
