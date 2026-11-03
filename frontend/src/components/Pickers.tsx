import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "../lib/api";
import { MONTHS, type Unit } from "../lib/types";
import { Field, Select } from "./ui";

export const useUnits = () => useQuery({ queryKey: ["units"], queryFn: async () => (await api.get<Unit[]>("/units")).data });

export function UnitPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { data: units } = useUnits();
  // gestor só tem uma unidade: já escolhe sozinho
  useEffect(() => {
    if (!value && units?.length) onChange(units[0].id);
  }, [value, units, onChange]);
  return (
    <Field label="Unidade">
      <Select value={value} onChange={(e) => onChange(e.target.value)} className="min-w-56">
        {!units?.length && <option value="">Nenhuma unidade cadastrada</option>}
        {units?.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export function MonthPicker({ year, month, onChange }: { year: number; month: number; onChange: (p: { year: number; month: number }) => void }) {
  const years = [year - 1, year, year + 1];
  return (
    <>
      <Field label="Mês">
        <Select value={month} onChange={(e) => onChange({ year, month: Number(e.target.value) })}>
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Ano">
        <Select value={year} onChange={(e) => onChange({ year: Number(e.target.value), month })}>
          {years.map((y) => (
            <option key={y}>{y}</option>
          ))}
        </Select>
      </Field>
    </>
  );
}
