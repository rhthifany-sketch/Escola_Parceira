import type { SignedDocType } from "@prisma/client";
import type { MonthData } from "./monthData";
import { anexoIPdf } from "./anexoI";
import { anexoIIPdf, anexoIIIPdf, anexoIVPdf, anexoVPdf } from "./declaracoes";

/** PDF de um anexo assinável (I a V) para as crianças de `data.rows`. */
export function anexoPdfByType(type: SignedDocType, data: MonthData): Promise<Buffer> {
  const students = data.rows.map((r) => r.student);
  switch (type) {
    case "ANEXO_I":
      return anexoIPdf(data);
    case "ANEXO_II":
      return anexoIIPdf(data.unit, data.year, students);
    case "ANEXO_III":
      return anexoIIIPdf(data.unit, students);
    case "ANEXO_IV":
      return anexoIVPdf(data.unit, students);
    case "ANEXO_V":
      return anexoVPdf(data.unit, students);
  }
}
