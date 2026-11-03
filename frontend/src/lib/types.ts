export type Role = "FINANCEIRO" | "GESTOR";

export interface User {
  id: string;
  name: string;
  role: Role;
  unitId: string | null;
}

export interface Unit {
  id: string;
  name: string;
  legalName: string;
  cnpj: string;
  legalRepName: string;
  legalRepCpf: string;
  active: boolean;
  _count?: { students: number };
}

export interface Student {
  id: string;
  unitId: string;
  name: string;
  shift: string;
  grei: string;
  birthDate: string | null;
  phone: string | null;
  address: string | null;
  email: string | null;
  enrollmentDate: string;
  exitDate: string | null;
  guardianName: string | null;
  guardianCpf: string | null;
  guardianPhone: string | null;
}

export interface MonthRow {
  studentId: string;
  name: string;
  grei: string;
  shift: string;
  justifiedAbsences: number;
  unjustifiedAbsences: number;
  frequency: number | null;
  belowMinimum: boolean;
  pending: string[];
}

export interface MonthData {
  unit: Unit;
  year: number;
  month: number;
  schoolDays: number | null;
  minFrequency: number;
  rows: MonthRow[];
}

export interface OverviewRow {
  unitId: string;
  unitName: string;
  students: number;
  schoolDays: number | null;
  attendanceSaved: boolean;
  updatedAt: string | null;
  belowMinimum: number;
  pendingRegistration: number;
}

export const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** "2026-03-15T00:00:00.000Z" → "15/03/2026" (datas sem fuso). */
export const formatDate = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");
