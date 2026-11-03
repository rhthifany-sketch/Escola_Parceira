/** Cardápio do Anexo XI: 4 semanas × 3 idades × 2 refeições × 5 dias. */
export const WEEKS = ["A", "B", "C", "D"] as const;
export const AGES = [
  { key: "0", label: "0 ano" },
  { key: "1", label: "1 ano" },
  { key: "2a5", label: "2 a 5 anos" },
] as const;
export const MEALS = [
  { key: "desjejum", label: "Desjejum*" },
  { key: "almoco", label: "Almoço*" },
] as const;
export const WEEKDAYS = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira"];

/** Valor diário da alimentação por aluno (Orientações para pagamento 2026). */
export const MEAL_DAILY_VALUE = 10.9;

export type Menu = Record<string, Record<string, Record<string, string[]>>>;

/** Sempre devolve o cardápio completo (campo que falta vira ""). */
export function normalizeMenu(raw: unknown): Menu {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const menu: Menu = {};
  for (const w of WEEKS) {
    menu[w] = {};
    for (const a of AGES) {
      menu[w][a.key] = {};
      for (const m of MEALS) {
        const days = src?.[w]?.[a.key]?.[m.key];
        menu[w][a.key][m.key] = WEEKDAYS.map((_d, i) => String(Array.isArray(days) ? days[i] ?? "" : "").slice(0, 300).trim());
      }
    }
  }
  return menu;
}

export const isMenuEmpty = (menu: Menu) =>
  WEEKS.every((w) => AGES.every((a) => MEALS.every((m) => menu[w][a.key][m.key].every((v) => !v))));

export const mealTotal = (students: number, schoolDays: number) => Math.round(students * schoolDays * MEAL_DAILY_VALUE * 100) / 100;
