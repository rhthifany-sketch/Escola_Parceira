/**
 * Regras do mês (sem banco, testadas em month.test.ts).
 * Datas são guardadas como DATE (meia-noite UTC), então tudo aqui é em UTC.
 */

export const MONTH_NAMES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** Frequência mínima (Anexo IV, art. 18 do decreto da Lei 4076/2025). */
export const MIN_FREQUENCY = 60;

export function monthRange(year: number, month: number) {
  return { start: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 0)) };
}

export interface EnrollmentDates {
  enrollmentDate: Date;
  exitDate: Date | null;
}

/** A criança estava matriculada em algum dia do mês. */
export function isEnrolledInMonth(s: EnrollmentDates, year: number, month: number): boolean {
  const { start, end } = monthRange(year, month);
  return s.enrollmentDate <= end && (s.exitDate === null || s.exitDate >= start);
}

/** Período do Anexo I: o mês, cortado pela matrícula e pela saída. */
export function servicePeriod(s: EnrollmentDates, year: number, month: number) {
  const { start, end } = monthRange(year, month);
  return {
    start: s.enrollmentDate > start ? s.enrollmentDate : start,
    end: s.exitDate && s.exitDate < end ? s.exitDate : end,
  };
}

/**
 * Frequência em % — só a falta NÃO justificada conta contra os 60%.
 * null quando os dias letivos do mês ainda não foram informados.
 */
export function frequency(schoolDays: number | null | undefined, unjustifiedAbsences: number): number | null {
  if (!schoolDays || schoolDays <= 0) return null;
  const present = Math.max(0, schoolDays - unjustifiedAbsences);
  return Math.round((present / schoolDays) * 1000) / 10;
}

export const belowMinimum = (freq: number | null) => freq !== null && freq < MIN_FREQUENCY;

/** Ordem alfabética exigida nos Anexos I a IV e X (ignora acento e caixa). */
export function byName<T extends { name: string }>(a: T, b: T) {
  return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
}

const pad = (n: number) => String(n).padStart(2, "0");
export const formatDate = (d: Date | null | undefined) =>
  d ? `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}` : "";
export const monthLabel = (year: number, month: number) => `${pad(month)}/${year}`;

/** Aceita "dd/mm/aaaa", "aaaa-mm-dd" ou data do Excel; devolve DATE em UTC. */
export function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  const text = String(value).trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(text);
  if (m) {
    const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    return validDate(y, Number(m[2]), Number(m[1]));
  }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3]));
  return null;
}

function validDate(y: number, mo: number, d: number): Date | null {
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? date : null;
}
