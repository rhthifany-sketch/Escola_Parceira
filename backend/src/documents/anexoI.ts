import { formatDate, servicePeriod } from "../lib/month";
import type { MonthData } from "./monthData";
import { blank, declarationPage, paragraph, renderPdf, signatureLine } from "./pdf";

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
      declarationPage(doc, "ANEXO I - DECLARAÇÃO DE FREQUÊNCIA");
      const p = paragraph;
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
