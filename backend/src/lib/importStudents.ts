import * as XLSX from "xlsx";
import { parseDate } from "./month";

export const normalize = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

export interface ImportedStudent {
  line: number;
  name: string;
  shift: string;
  grei: string;
  birthDate: Date | null;
  phone: string | null;
  address: string | null;
  email: string | null;
  enrollmentDate: Date | null;
  guardianName: string | null;
  guardianCpf: string | null;
  guardianPhone: string | null;
}

/** Cabeçalhos aceitos (os do Anexo X + colunas opcionais do responsável). */
const FIELDS: { key: keyof ImportedStudent; match: (h: string) => boolean }[] = [
  { key: "name", match: (h) => h.startsWith("NOME DA CRIANCA") || h === "NOME" || h === "ALUNO" || h === "NOME DO ALUNO" },
  { key: "shift", match: (h) => h === "TURNO" },
  { key: "grei", match: (h) => h.startsWith("GREI") || h === "TURMA" },
  { key: "birthDate", match: (h) => h.startsWith("DATA DE NASCIMENTO") || h === "NASCIMENTO" },
  { key: "phone", match: (h) => h === "TELEFONE" },
  { key: "address", match: (h) => h.startsWith("ENDERECO") },
  { key: "email", match: (h) => h === "E-MAIL" || h === "EMAIL" },
  { key: "enrollmentDate", match: (h) => h.startsWith("DATA DE MATRICULA") || h === "MATRICULA" },
  { key: "guardianName", match: (h) => h === "RESPONSAVEL" || h.startsWith("NOME DO RESPONSAVEL") },
  { key: "guardianCpf", match: (h) => h.startsWith("CPF") },
  { key: "guardianPhone", match: (h) => h.startsWith("WHATSAPP") || h.startsWith("CELULAR DO RESPONSAVEL") },
];

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

/**
 * Lê uma planilha no formato do Anexo X (ou uma lista simples com os mesmos
 * cabeçalhos): acha a linha do cabeçalho pelo "Nome da Criança" e para no
 * "Total de alunos atendidos". (SheetJS: o ExcelJS quebra com a imagem do
 * cabeçalho da prefeitura.)
 */
export async function readStudentsSheet(buffer: Buffer): Promise<{ rows: ImportedStudent[]; errors: string[] }> {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { rows: [], errors: ["Planilha vazia"] };
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: true });

  const headerIdx = grid.slice(0, 15).findIndex((row) => row.some((c) => FIELDS[0].match(normalize(cellText(c)))));
  if (headerIdx < 0) return { rows: [], errors: ['Não achei a coluna "Nome da Criança" no começo da planilha'] };
  const colOf = new Map<keyof ImportedStudent, number>();
  // o cabeçalho pode ocupar duas linhas (Frequência → faltas)
  for (const row of [grid[headerIdx], grid[headerIdx + 1] ?? []]) {
    row.forEach((c, col) => {
      const f = FIELDS.find((x) => x.match(normalize(cellText(c))));
      if (f && !colOf.has(f.key)) colOf.set(f.key, col);
    });
  }

  const rows: ImportedStudent[] = [];
  const errors: string[] = [];
  const get = (r: unknown[], key: keyof ImportedStudent) => {
    const col = colOf.get(key);
    return col === undefined ? null : r[col];
  };
  const text = (r: unknown[], key: keyof ImportedStudent) => {
    const v = get(r, key);
    return (v instanceof Date ? "" : cellText(v).trim()) || null;
  };
  const date = (r: unknown[], key: keyof ImportedStudent) => {
    const v = get(r, key);
    if (v instanceof Date) {
      // SheetJS devolve a data no fuso local; arredonda pro dia mais próximo
      return parseDate(new Date(v.getTime() + 12 * 3600 * 1000 - v.getTimezoneOffset() * 60000));
    }
    return parseDate(cellText(v).trim());
  };

  for (let i = headerIdx + 1; i < grid.length; i++) {
    const row = grid[i] ?? [];
    const line = i + 1;
    if (normalize(cellText(row[0])).startsWith("TOTAL DE ALUNOS")) break;
    const name = text(row, "name");
    if (!name || normalize(name).startsWith("FALTAS")) continue;
    const enrollmentDate = date(row, "enrollmentDate");
    if (!enrollmentDate) errors.push(`Linha ${line} (${name}): data de matrícula vazia ou inválida`);
    rows.push({
      line,
      name: name.replace(/\s+/g, " "),
      shift: text(row, "shift") ?? "",
      grei: text(row, "grei") ?? "",
      birthDate: date(row, "birthDate"),
      phone: text(row, "phone"),
      address: text(row, "address"),
      email: text(row, "email"),
      enrollmentDate,
      guardianName: text(row, "guardianName"),
      guardianCpf: text(row, "guardianCpf"),
      guardianPhone: text(row, "guardianPhone"),
    });
  }
  return { rows, errors };
}
