/** Regras de data do envio automático (horário de Brasília). */

export interface AutoSendSettings {
  autoSendEnabled: boolean;
  autoSendDay: number;
  autoSendMonth: string; // ATUAL | ANTERIOR
}

/** Data de hoje em Brasília. */
export function todayBR(now = new Date()) {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(now)
    .split("-")
    .map(Number);
  return { year: y, month: m, day: d };
}

/** Mês de referência dos documentos enviados no mês (year, month). */
export function referenceMonth(s: Pick<AutoSendSettings, "autoSendMonth">, year: number, month: number) {
  if (s.autoSendMonth === "ANTERIOR") return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  return { year, month };
}

/** Hoje é dia de enviar? Devolve o mês de referência, ou null. */
export function dueReference(s: AutoSendSettings, now = new Date()) {
  if (!s.autoSendEnabled) return null;
  const t = todayBR(now);
  if (t.day < s.autoSendDay) return null;
  return referenceMonth(s, t.year, t.month);
}

/** Próximo envio: a data e o mês de referência (para mostrar na tela). */
export function nextSend(s: AutoSendSettings, alreadySent: (ref: { year: number; month: number }) => boolean, now = new Date()) {
  if (!s.autoSendEnabled) return null;
  const t = todayBR(now);
  let { year, month } = t;
  for (let i = 0; i < 3; i++) {
    const ref = referenceMonth(s, year, month);
    const isThisMonth = year === t.year && month === t.month;
    if (!alreadySent(ref)) {
      const day = isThisMonth && t.day > s.autoSendDay ? t.day : s.autoSendDay;
      return { date: { year, month, day }, reference: ref, late: isThisMonth && t.day > s.autoSendDay };
    }
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }
  return null;
}
