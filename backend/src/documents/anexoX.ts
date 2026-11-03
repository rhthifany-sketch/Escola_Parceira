import ExcelJS from "exceljs";
import { MONTH_NAMES, formatDate, monthRange } from "../lib/month";
import type { MonthData, MonthRow } from "./monthData";
import { HEADER_IMAGE, renderPdf, signatureLine } from "./pdf";

/** Colunas do ANEXO X (mesma ordem da planilha da prefeitura). */
const COLUMNS: { header: string; width: number; value: (r: MonthRow, i: number) => string | number }[] = [
  { header: "Nº", width: 5, value: (_r, i) => i + 1 },
  { header: "Nome da Criança", width: 34, value: (r) => r.student.name },
  { header: "Turno", width: 11, value: (r) => r.student.shift },
  { header: "Grei", width: 7, value: (r) => r.student.grei },
  { header: "Faltas Justificadas", width: 12, value: (r) => r.justifiedAbsences },
  { header: "Faltas não Justificadas", width: 12, value: (r) => r.unjustifiedAbsences },
  { header: "Data de Nascimento", width: 12, value: (r) => formatDate(r.student.birthDate) },
  { header: "Telefone", width: 15, value: (r) => r.student.phone ?? r.student.guardianPhone ?? "" },
  { header: "Endereço", width: 38, value: (r) => r.student.address ?? "" },
  { header: "E-mail", width: 28, value: (r) => r.student.email ?? "" },
  { header: "Data de Matrícula", width: 12, value: (r) => formatDate(r.student.enrollmentDate) },
];

const title = (d: MonthData) =>
  `ANEXO X – RELATÓRIO MENSAL DE PRESTAÇÃO DO SERVIÇO EDUCACIONAL ${d.year}`;
const placeAndDate = (d: MonthData) => {
  const end = monthRange(d.year, d.month).end;
  return `Niterói, ${end.getUTCDate()} de ${MONTH_NAMES[d.month - 1]} de ${d.year}`;
};

export async function anexoXXlsx(data: MonthData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Anexo X", { pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1 } });
  ws.columns = COLUMNS.map((c) => ({ width: c.width }));
  const border: Partial<ExcelJS.Borders> = {
    top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" },
  };

  ws.mergeCells("A1:K1");
  const t = ws.getCell("A1");
  t.value = `${title(data)}\nNome da Escola ou Creche: ${data.unit.legalName}   —   Mês de referência: ${MONTH_NAMES[data.month - 1]}/${data.year}`;
  t.font = { bold: true, size: 12 };
  t.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
  ws.getRow(1).height = 42;

  // cabeçalho em duas linhas: "Frequência" em cima das duas colunas de faltas
  COLUMNS.forEach((c, i) => {
    const col = ws.getColumn(i + 1).letter;
    if (i === 4 || i === 5) {
      ws.getCell(`${col}3`).value = c.header;
    } else {
      ws.mergeCells(`${col}2:${col}3`);
      ws.getCell(`${col}2`).value = c.header;
    }
  });
  ws.mergeCells("E2:F2");
  ws.getCell("E2").value = "Frequência";
  for (const r of [2, 3]) {
    ws.getRow(r).eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { bold: true };
      cell.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
      cell.border = border;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
    });
  }
  ws.getRow(3).height = 30;

  data.rows.forEach((row, i) => {
    const r = ws.addRow(COLUMNS.map((c) => c.value(row, i)));
    r.eachCell({ includeEmpty: true }, (cell, n) => {
      cell.border = border;
      cell.alignment = { vertical: "middle", horizontal: n === 2 || n >= 9 ? "left" : "center", wrapText: n === 9 };
    });
  });

  const total = ws.addRow(["Total de alunos atendidos", "", "", "", data.rows.length]);
  ws.mergeCells(`A${total.number}:D${total.number}`);
  total.font = { bold: true };
  total.eachCell({ includeEmpty: true }, (cell) => (cell.border = border));
  ws.addRow([]);
  ws.addRow([placeAndDate(data)]);
  ws.addRow([]);
  ws.addRow([]);
  ws.addRow(["", "______________________________________________"]);
  ws.addRow(["", `${data.unit.legalRepName} — Representante legal da Instituição`]);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function anexoXPdf(data: MonthData): Promise<Buffer> {
  return renderPdf({ layout: "landscape", margin: 28, info: { Title: `Anexo X - ${data.unit.name}` } }, (doc) => {
    const left = doc.page.margins.left;
    const usable = doc.page.width - left * 2;
    const totalWidth = COLUMNS.reduce((t, c) => t + c.width, 0);
    const widths = COLUMNS.map((c) => (c.width / totalWidth) * usable);
    const pad = 3;
    const fontSize = 7.5;

    const header = () => {
      doc.image(HEADER_IMAGE, (doc.page.width - 170) / 2, 12, { width: 170 });
      doc.y = 90;
      doc.font("Helvetica-Bold").fontSize(11).text(title(data), left, doc.y, { width: usable, align: "center" });
      doc.font("Helvetica").fontSize(9).text(
        `Nome da Escola ou Creche: ${data.unit.legalName}     Mês de referência: ${MONTH_NAMES[data.month - 1]}/${data.year}`,
        left, doc.y + 2, { width: usable, align: "center" }
      );
      doc.moveDown(0.6);
      // cabeçalho da tabela em duas linhas: "Frequência" em cima das faltas
      const y = doc.y;
      const h = 52;
      let x = left;
      doc.font("Helvetica-Bold").fontSize(fontSize).lineWidth(0.5);
      const cell = (cx: number, cy: number, w: number, ch: number, label: string) => {
        doc.rect(cx, cy, w, ch).fillAndStroke("#f2f2f2", "#000");
        doc.fillColor("#000");
        const th = doc.heightOfString(label, { width: w - pad * 2 });
        doc.text(label, cx + pad, cy + (ch - th) / 2, { width: w - pad * 2, align: "center" });
      };
      COLUMNS.forEach((c, i) => {
        if (i === 4) cell(x, y, widths[4] + widths[5], h / 2, "Frequência");
        if (i === 4 || i === 5) cell(x, y + h / 2, widths[i], h / 2, i === 4 ? "Faltas justificadas" : "Faltas não justificadas");
        else cell(x, y, widths[i], h, c.header);
        x += widths[i];
      });
      doc.y = y + h;
    };

    header();
    doc.font("Helvetica").fontSize(fontSize);
    data.rows.forEach((row, i) => {
      const values = COLUMNS.map((c) => String(c.value(row, i)));
      const h = Math.max(16, ...values.map((v, j) => doc.heightOfString(v, { width: widths[j] - pad * 2 }) + pad * 2));
      if (doc.y + h > doc.page.height - 120) {
        doc.addPage();
        header();
        doc.font("Helvetica").fontSize(fontSize);
      }
      const y = doc.y;
      let x = left;
      values.forEach((v, j) => {
        doc.rect(x, y, widths[j], h).stroke();
        doc.text(v, x + pad, y + pad, { width: widths[j] - pad * 2, align: j === 1 || j === 8 || j === 9 ? "left" : "center" });
        x += widths[j];
      });
      doc.y = y + h;
    });
    doc.lineWidth(0.5);
    const y = doc.y;
    const w4 = widths.slice(0, 4).reduce((a, b) => a + b, 0);
    doc.rect(left, y, w4, 16).stroke();
    doc.rect(left + w4, y, widths[4], 16).stroke();
    doc.font("Helvetica-Bold").text("Total de alunos atendidos", left + pad, y + 4, { width: w4 - pad * 2 });
    doc.text(String(data.rows.length), left + w4 + pad, y + 4, { width: widths[4] - pad * 2, align: "center" });
    doc.y = y + 30;
    doc.font("Helvetica").fontSize(10).text(placeAndDate(data), left, doc.y);
    signatureLine(doc, "Representante legal da Instituição Privada de Educação", data.unit.legalRepName);
  });
}
