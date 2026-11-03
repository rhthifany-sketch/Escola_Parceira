import type { Student, Unit } from "@prisma/client";
import { formatDate } from "../lib/month";
import { BLANK_DATE, blank, declarationPage, paragraph as p, renderPdf, signatureLine } from "./pdf";

/**
 * Anexos II a V: uma página por criança, em ordem alfabética, todas num PDF
 * só (como a prefeitura pede). Os textos são os dos modelos da FME 2026.
 * II, III e IV são assinados uma vez e reenviados todo mês, então a data
 * fica em branco para quem assina preencher.
 */

const many = (title: string, students: Student[], page: (doc: PDFKit.PDFDocument, s: Student) => void) =>
  renderPdf({ autoFirstPage: false, info: { Title: title } }, (doc) => {
    for (const s of students) page(doc, s);
  });

const placeDate = (doc: PDFKit.PDFDocument, date?: Date | null) => {
  doc.moveDown(2);
  doc.font("Helvetica").fontSize(11).text(`Niterói, ${date ? formatDate(date) : BLANK_DATE}`, { align: "right" });
  doc.moveDown(2);
};

export function anexoIIPdf(unit: Unit, year: number, students: Student[]) {
  return many(`Anexo II - ${unit.name}`, students, (doc, s) => {
    declarationPage(doc, "ANEXO II - DECLARAÇÃO DE RECEBIMENTO DE INFORMAÇÃO");
    doc.text(
      `Eu, ${blank(s.guardianName)}, CPF ${blank(s.guardianCpf, 14)}, responsável por ${s.name}, declaro, sob as penas da Lei, ` +
        `que recebi todas as informações pertinentes à bolsa de estudo disponibilizada pelo município de Niterói/Secretaria ` +
        `Municipal de Educação/Fundação Municipal de Educação relativo ao ano letivo em curso ${year}. O atendimento, a minha ` +
        `pessoa, foi realizado pelo (a) ${blank(unit.attendantName)}, CPF ${blank(unit.attendantCpf, 14)}.`,
      p
    );
    doc.moveDown();
    doc.text(
      `Declaro ainda, que as informações prestadas referem-se à gratuidade total da bolsa de estudo, durante período em que ` +
        `a criança estiver matriculada, sendo seu atendimento custeado pelo Município de Niterói. Tenho ciência que não poderá ` +
        `ser feito nenhum tipo de cobrança por parte da ${unit.legalName}.`,
      p
    );
    placeDate(doc);
    signatureLine(doc, "Assinatura do responsável legal pela criança", s.guardianName);
  });
}

export function anexoIIIPdf(unit: Unit, students: Student[]) {
  return many(`Anexo III - ${unit.name}`, students, (doc, s) => {
    declarationPage(doc, "ANEXO III - DECLARAÇÃO DE RESPONSABILIDADE DE DEFERIMENTO DE MATRÍCULA");
    doc.text(
      `Eu, ${unit.legalRepName}, CPF ${unit.legalRepCpf}, na qualidade de representante legal da Instituição ${unit.legalName}, ` +
        `inscrita no CNPJ/MF sob o nº ${unit.cnpj}, declaro, sob as penas da lei, que recebi e realizei a conferência dos ` +
        `documentos necessários da criança ${s.name}, beneficiada pela bolsa de estudo disponibilizada pelo Município de ` +
        `Niterói, com parecer DEFERIDO para efetivar matrícula nesta Instituição Privada de Educação.`,
      p
    );
    doc.moveDown();
    doc.text(
      `Declaro ainda, que estou ciente de minha responsabilidade civil e penal, responsabilizando-me pela constatação da ` +
        `veracidade das informações e documentos a mim apresentados, e que eventuais divergências ou irregularidades ` +
        `detectadas, bem como as alterações e correções que se fizerem necessárias serão comunicadas à Fundação Municipal ` +
        `de Educação imediatamente.`,
      p
    );
    placeDate(doc);
    signatureLine(doc, "Assinatura do representante legal da Instituição Privada de Educação", unit.legalRepName);
  });
}

export function anexoIVPdf(unit: Unit, students: Student[]) {
  return many(`Anexo IV - ${unit.name}`, students, (doc, s) => {
    declarationPage(doc, "ANEXO IV - TERMO DE RESPONSABILIDADE PELA VERACIDADE DAS INFORMAÇÕES");
    doc.fontSize(10.5);
    const q = { ...p, lineGap: 3 };
    doc.text(
      `Eu, ${blank(s.guardianName)}, CPF ${blank(s.guardianCpf, 14)}, responsável por ${s.name}, declaro, sob pena de perda ` +
        `da bolsa de estudo e responsabilização legal, que todas as informações prestadas e documentação entregues no ato da ` +
        `matrícula do meu dependente são verdadeiras.`,
      q
    );
    doc.moveDown(0.7);
    doc.text(
      `Assumo a responsabilidade de fazer bom uso da bolsa de estudo disponibilizada pela Prefeitura, fazendo meu dependente ` +
        `frequentar a unidade escolar nos horários e dias estabelecidos conforme calendário escolar recebido no ato da matrícula.`,
      q
    );
    doc.moveDown(0.7);
    doc.text(
      `Declaro que tomei ciência do que consta no capítulo II art. 18 do Decreto Municipal que regulamenta a Lei Municipal ` +
        `de nº 4076/2025, o qual estabelece em seu parágrafo único, que: “A manutenção da bolsa de estudo dependerá da ` +
        `comprovação de frequência da criança a, no mínimo, 60% (sessenta por cento) das aulas previstas para o mês”, e que o ` +
        `não cumprido do estabelecido, permitirá a perda da vaga por infrequência escolar e, consequentemente, o cancelamento ` +
        `da matrícula da criança na escola atual.`,
      q
    );
    doc.moveDown(0.7);
    doc.text(
      `Em caso de desistência, assumo a responsabilidade de comunicar no prazo de até 5 (cinco) dias úteis a Instituição ` +
        `Privada de Educação, bem como a Fundação Municipal de Educação.`,
      q
    );
    doc.moveDown(1);
    doc.text(`Niterói, ${BLANK_DATE}`, { align: "right" });
    doc.moveDown(0.5);
    signatureLine(doc, "Assinatura do responsável legal pela criança", s.guardianName);
    doc.moveDown(1.5);
    doc.font("Helvetica").fontSize(10.5).text(
      "Atesto que toda documentação exigida no ato da matrícula da criança foi entregue e conferida a autenticidade pela " +
        "Instituição Privada de Educação.",
      q
    );
    signatureLine(doc, "Nome e assinatura responsável pelo atesto", unit.legalRepName);
  });
}

export function anexoVPdf(unit: Unit, students: Student[]) {
  return many(`Anexo V - ${unit.name}`, students, (doc, s) => {
    const year = s.materialDeliveredAt?.getUTCFullYear();
    declarationPage(doc, "ANEXO V – DECLARAÇÃO DE RECEBIMENTO DO MATERIAL PEDAGÓGICO E UNIFORME");
    doc.text(
      `Eu, ${blank(s.guardianName)}, CPF ${blank(s.guardianCpf, 14)}, responsável por ${s.name}, declaro, sob as penas da ` +
        `Lei, que recebi da ${unit.legalName}:`,
      p
    );
    doc.moveDown();
    doc.text(`(X) Material didático-pedagógico para o ano letivo ${year ?? "____"}`, { indent: 20, lineGap: 5 });
    doc.text(`(X) Uniformes para o ano letivo ${year ?? "____"}`, { indent: 20, lineGap: 5 });
    doc.moveDown();
    doc.text(
      `Declaro ainda que o material pedagógico, de consumo, e de uniforme serão utilizados durante todo o período em que a ` +
        `criança estiver matriculada. Tenho ciência que não poderá ser feito nenhum tipo de cobrança por parte da ` +
        `${unit.legalName}.`,
      p
    );
    placeDate(doc, s.materialDeliveredAt);
    signatureLine(doc, "Assinatura do responsável legal pela criança", s.guardianName);
  });
}
