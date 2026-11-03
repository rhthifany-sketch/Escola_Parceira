import type { Student, Unit } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { byName, frequency, isEnrolledInMonth, monthRange } from "../lib/month";
import { HttpError } from "../lib/http";

export interface MonthRow {
  student: Student;
  justifiedAbsences: number;
  unjustifiedAbsences: number;
  /** % de frequência (só falta não justificada conta); null sem dias letivos. */
  frequency: number | null;
}

export interface MonthData {
  unit: Unit;
  year: number;
  month: number;
  schoolDays: number | null;
  rows: MonthRow[];
}

/** Crianças matriculadas no mês, em ordem alfabética, com as faltas lançadas. */
export async function loadMonth(unitId: string, year: number, month: number): Promise<MonthData> {
  if (!Number.isInteger(year) || year < 2000 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new HttpError(400, "Mês ou ano inválido");
  }
  const unit = await prisma.unit.findUnique({ where: { id: unitId } });
  if (!unit) throw new HttpError(404, "Unidade não encontrada");
  const { start, end } = monthRange(year, month);
  const [students, report] = await Promise.all([
    prisma.student.findMany({
      where: { unitId, enrollmentDate: { lte: end }, OR: [{ exitDate: null }, { exitDate: { gte: start } }] },
    }),
    prisma.monthlyReport.findUnique({
      where: { unitId_year_month: { unitId, year, month } },
      include: { attendances: true },
    }),
  ]);
  const byStudent = new Map(report?.attendances.map((a) => [a.studentId, a]) ?? []);
  const schoolDays = report?.schoolDays ?? null;
  const rows = students
    .filter((s) => isEnrolledInMonth(s, year, month))
    .sort(byName)
    .map((student) => {
      const a = byStudent.get(student.id);
      const unjustifiedAbsences = a?.unjustifiedAbsences ?? 0;
      return {
        student,
        justifiedAbsences: a?.justifiedAbsences ?? 0,
        unjustifiedAbsences,
        frequency: frequency(schoolDays, unjustifiedAbsences),
      };
    });
  return { unit, year, month, schoolDays, rows };
}
