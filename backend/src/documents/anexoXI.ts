import { MONTH_NAMES } from "../lib/month";
import { AGES, MEALS, MEAL_DAILY_VALUE, WEEKDAYS, WEEKS, mealTotal, type Menu } from "../lib/menu";
import type { MonthData } from "./monthData";
import { HEADER_IMAGE, renderPdf, signatureLine } from "./pdf";

const money = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ANEXO XI – Relatório mensal de refeições e cardápio escolar (paisagem). */
export function anexoXIPdf(data: MonthData, menu: Menu): Promise<Buffer> {
  return renderPdf({ layout: "landscape", margin: 30, info: { Title: `Anexo XI - ${data.unit.name}` } }, (doc) => {
    const left = doc.page.margins.left;
    const usable = doc.page.width - left * 2;
    const bottom = doc.page.height - doc.page.margins.bottom;
    const widths = [70, 80, ...WEEKDAYS.map(() => (usable - 150) / 5)];
    const pad = 4;
    doc.lineWidth(0.5);

    const top = () => {
      doc.image(HEADER_IMAGE, (doc.page.width - 170) / 2, 10, { width: 170 });
      doc.y = 88;
    };
    const cell = (x: number, y: number, w: number, h: number, text: string, opts: { bold?: boolean; fill?: boolean; align?: "left" | "center" } = {}) => {
      if (opts.fill) doc.rect(x, y, w, h).fillAndStroke("#f2f2f2", "#000").fillColor("#000");
      else doc.rect(x, y, w, h).stroke();
      doc.font(opts.bold ? "Helvetica-Bold" : "Helvetica").fontSize(8);
      const th = doc.heightOfString(text, { width: w - pad * 2 });
      doc.text(text, x + pad, y + Math.max(pad, (h - th) / 2), { width: w - pad * 2, align: opts.align ?? "center" });
    };

    top();
    doc.font("Helvetica-Bold").fontSize(12).text("ANEXO XI RELATÓRIO MENSAL DE REFEIÇÕES E CARDÁPIO ESCOLAR", left, doc.y, { width: usable, align: "center" });
    doc.font("Helvetica").fontSize(9).text(
      `${data.unit.legalName}  —  Mês de referência: ${MONTH_NAMES[data.month - 1]}/${data.year}`,
      left, doc.y + 2, { width: usable, align: "center" }
    );
    doc.moveDown(0.8);

    for (const week of WEEKS) {
      doc.font("Helvetica").fontSize(8);
      const rowHeights = AGES.flatMap((a) =>
        MEALS.map((m) =>
          Math.max(16, ...menu[week][a.key][m.key].map((t, i) => doc.heightOfString(t, { width: widths[i + 2] - pad * 2 }) + pad * 2))
        )
      );
      const tableHeight = 18 + 22 + rowHeights.reduce((a, b) => a + b, 0) + 14;
      if (doc.y + tableHeight > bottom) {
        doc.addPage();
        top();
      }
      doc.font("Helvetica-Bold").fontSize(10).text(`CARDÁPIO SEMANA ${week} – GREI 0 AO 5`, left, doc.y, { width: usable, align: "center" });
      let y = doc.y + 4;
      let x = left;
      ["Idade", "Tipo de Refeição*", ...WEEKDAYS].forEach((h, i) => {
        cell(x, y, widths[i], 22, h, { bold: true, fill: true });
        x += widths[i];
      });
      y += 22;
      let r = 0;
      for (const a of AGES) {
        const ageHeight = rowHeights[r] + rowHeights[r + 1];
        cell(left, y, widths[0], ageHeight, a.label, { bold: true });
        for (const m of MEALS) {
          const h = rowHeights[r++];
          x = left + widths[0];
          cell(x, y, widths[1], h, m.label);
          x += widths[1];
          menu[week][a.key][m.key].forEach((t, i) => {
            cell(x, y, widths[i + 2], h, t, { align: "left" });
            x += widths[i + 2];
          });
          y += h;
        }
      }
      doc.font("Helvetica-Oblique").fontSize(7.5).text("*O tipo de refeição poderá variar de acordo com o atendimento (turno).", left, y + 3);
      doc.moveDown(1);
    }

    // quadro do cálculo
    if (doc.y + 150 > bottom) {
      doc.addPage();
      top();
    }
    doc.font("Helvetica-Bold").fontSize(10).text("RELATÓRIO MENSAL DE REFEIÇÕES", left, doc.y, { width: usable, align: "center" });
    const students = data.rows.length;
    const days = data.schoolDays ?? 0;
    const headers = ["Mês de Referência", "Quantitativo de Alunos", "Valor Unitário Diário (R$)", "Dias Letivos no Mês", "Valor Total (R$)"];
    const values = [`${MONTH_NAMES[data.month - 1]}/${data.year}`, String(students), money(MEAL_DAILY_VALUE), String(days), money(mealTotal(students, days))];
    const w = usable / 5;
    let y = doc.y + 4;
    headers.forEach((h, i) => cell(left + i * w, y, w, 22, h, { bold: true, fill: true }));
    y += 22;
    values.forEach((v, i) => cell(left + i * w, y, w, 20, v, { bold: i === 4 }));
    doc.y = y + 30;
    doc.x = left;
    signatureLine(doc, "Representante legal da Instituição Privada de Educação", data.unit.legalRepName);
  });
}
