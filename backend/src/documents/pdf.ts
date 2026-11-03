import path from "path";
import PDFDocument from "pdfkit";

export const HEADER_IMAGE = path.resolve(__dirname, "../../assets/cabecalho-prefeitura.png");

/** Junta o PDF gerado num Buffer. */
export function renderPdf(options: PDFKit.PDFDocumentOptions, draw: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 60, ...options });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      draw(doc);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/** Linha de assinatura com o nome por baixo. */
export function signatureLine(doc: PDFKit.PDFDocument, label: string, name?: string | null) {
  const width = 320;
  const x = (doc.page.width - width) / 2;
  doc.moveDown(2.5);
  const y = doc.y;
  doc.moveTo(x, y).lineTo(x + width, y).lineWidth(0.7).stroke();
  doc.moveDown(0.3);
  if (name) doc.font("Helvetica-Bold").fontSize(10).text(name, x, doc.y, { width, align: "center" });
  doc.font("Helvetica").fontSize(10).text(label, x, doc.y, { width, align: "center" });
  doc.x = doc.page.margins.left;
}
