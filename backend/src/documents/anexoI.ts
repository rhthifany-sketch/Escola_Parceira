import { formatDate, servicePeriod } from "../lib/month";
import type { MonthData } from "./monthData";
import { HEADER_IMAGE, renderPdf, signatureLine } from "./pdf";

const blank = (v: string | null | undefined, size = 30) => (v && v.trim() ? v.trim() : "_".repeat(size));

/**
 * ANEXO I – Declaração de frequência: uma página por criança, em ordem
 * alfabética (igual ao Anexo X), todas num arquivo só — como a prefeitura
 * pede ("todos os anexos 1 juntos").
 */
export function anexoIPdf(data: MonthData): Promise<Buffer> {
  const { unit } = data;
  return renderPdf({ autoFirstPage: false, info: { Title: `Anexo I - ${unit.name}` } }, (doc) => {
    for (const row of data.rows) {
      const s = row.student;
      const period = servicePeriod(s, data.year, data.month);
      doc.addPage();
      doc.image(HEADER_IMAGE, (doc.page.width - 260) / 2, 30, { width: 260 });
      doc.y = 170;
      doc.font("Helvetica-Bold").fontSize(12).text("ANEXO I - DECLARAÇÃO DE FREQUÊNCIA", { align: "center" });
      doc.moveDown(2);
      doc.font("Helvetica").fontSize(11);
      const p = { align: "justify" as const, lineGap: 5 };
      doc.text(
        `Eu, ${blank(unit.legalRepName)}, CPF ${blank(unit.legalRepCpf, 14)}, representante legal da Instituição ` +
          `${blank(unit.legalName)}, inscrita no CNPJ ${blank(unit.cnpj, 18)}, declaro sob as penas da Lei, que ` +
          `${s.name} frequentou as atividades nos dias e horários estabelecidos no calendário escolar, no período ` +
          `compreendido entre ${formatDate(period.start)} e ${formatDate(period.end)}, conforme registrado no diário de ` +
          `classe da turma GREI ${blank(s.grei, 6)}.`,
        p
      );
      doc.moveDown();
      doc.text("Declaro ainda que as informações prestadas são verídicas e que estou ciente das penalidades da Lei.", p);
      doc.moveDown(2);
      doc.text(`Niterói, ${formatDate(period.end)}`, { align: "right" });
      doc.moveDown(2);
      signatureLine(doc, "Assinatura do representante legal da Instituição Privada de Educação", unit.legalRepName);
      doc.moveDown(2);
      doc.font("Helvetica").fontSize(11).text("Ciente:");
      signatureLine(doc, "Assinatura do responsável legal pela criança", s.guardianName);
    }
  });
}
