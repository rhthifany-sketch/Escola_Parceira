import { describe, expect, it } from "vitest";
import { belowMinimum, byName, frequency, isEnrolledInMonth, parseDate, servicePeriod } from "./month";

const d = (s: string) => parseDate(s)!;

describe("frequência", () => {
  it("só a falta não justificada conta", () => {
    expect(frequency(20, 8)).toBe(60);
    expect(frequency(20, 9)).toBe(55);
    expect(belowMinimum(frequency(20, 8))).toBe(false);
    expect(belowMinimum(frequency(20, 9))).toBe(true);
  });
  it("sem dias letivos não calcula", () => {
    expect(frequency(null, 3)).toBeNull();
    expect(belowMinimum(null)).toBe(false);
  });
});

describe("matrícula no mês", () => {
  const s = { enrollmentDate: d("15/03/2026"), exitDate: d("10/10/2026") };
  it("entra no mês da matrícula e no da saída", () => {
    expect(isEnrolledInMonth(s, 2026, 2)).toBe(false);
    expect(isEnrolledInMonth(s, 2026, 3)).toBe(true);
    expect(isEnrolledInMonth(s, 2026, 10)).toBe(true);
    expect(isEnrolledInMonth(s, 2026, 11)).toBe(false);
  });
  it("período do Anexo I é cortado pela matrícula e pela saída", () => {
    const mar = servicePeriod(s, 2026, 3);
    expect([mar.start, mar.end]).toEqual([d("15/03/2026"), d("31/03/2026")]);
    const oct = servicePeriod(s, 2026, 10);
    expect([oct.start, oct.end]).toEqual([d("01/10/2026"), d("10/10/2026")]);
  });
});

describe("datas", () => {
  it("lê os formatos da planilha", () => {
    expect(parseDate("05/02/2021")).toEqual(new Date(Date.UTC(2021, 1, 5)));
    expect(parseDate("2021-02-05")).toEqual(new Date(Date.UTC(2021, 1, 5)));
    expect(parseDate("31/02/2021")).toBeNull();
    expect(parseDate("")).toBeNull();
  });
});

it("ordem alfabética ignora acento", () => {
  const names = ["Érica", "Davi", "Eduardo"].map((name) => ({ name }));
  expect(names.sort(byName).map((n) => n.name)).toEqual(["Davi", "Eduardo", "Érica"]);
});

import { mealTotal, normalizeMenu, isMenuEmpty } from "./menu";

describe("Anexo XI", () => {
  it("alimentação = alunos × R$ 10,90 × dias letivos", () => {
    expect(mealTotal(30, 20)).toBe(6540);
    expect(mealTotal(7, 21)).toBe(1602.3);
  });
  it("cardápio incompleto vira completo, sem quebrar", () => {
    const m = normalizeMenu({ A: { "0": { almoco: ["Arroz", "Feijão"] } } });
    expect(m.A["0"].almoco).toEqual(["Arroz", "Feijão", "", "", ""]);
    expect(m.D["2a5"].desjejum).toHaveLength(5);
    expect(isMenuEmpty(normalizeMenu(null))).toBe(true);
    expect(isMenuEmpty(m)).toBe(false);
  });
});
