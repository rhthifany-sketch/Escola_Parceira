import { describe, expect, it } from "vitest";
import { dueReference, nextSend, referenceMonth, todayBR } from "./schedule";

const at = (iso: string) => new Date(iso);
const on = { autoSendEnabled: true, autoSendDay: 15, autoSendMonth: "ATUAL" };

describe("envio automático", () => {
  it("usa o horário de Brasília", () => {
    // 01h do dia 15 em UTC ainda é dia 14 em Brasília
    expect(todayBR(at("2026-11-15T01:00:00Z")).day).toBe(14);
    expect(todayBR(at("2026-11-15T12:00:00Z")).day).toBe(15);
  });
  it("só envia a partir do dia escolhido", () => {
    expect(dueReference(on, at("2026-11-14T15:00:00Z"))).toBeNull();
    expect(dueReference(on, at("2026-11-15T15:00:00Z"))).toEqual({ year: 2026, month: 11 });
    expect(dueReference({ ...on, autoSendEnabled: false }, at("2026-11-20T15:00:00Z"))).toBeNull();
  });
  it("mês anterior vira o ano em janeiro", () => {
    expect(referenceMonth({ autoSendMonth: "ANTERIOR" }, 2027, 1)).toEqual({ year: 2026, month: 12 });
    expect(dueReference({ ...on, autoSendMonth: "ANTERIOR", autoSendDay: 3 }, at("2026-11-05T15:00:00Z"))).toEqual({ year: 2026, month: 10 });
  });
  it("próximo envio", () => {
    const none = () => false;
    expect(nextSend(on, none, at("2026-11-03T15:00:00Z"))).toMatchObject({ date: { year: 2026, month: 11, day: 15 }, late: false });
    // ligou depois do dia: envia já (atrasado) este mês
    expect(nextSend(on, none, at("2026-11-20T15:00:00Z"))).toMatchObject({ date: { day: 20 }, late: true });
    // este mês já foi: próximo é dezembro
    const sentNov = (r: { year: number; month: number }) => r.month === 11;
    expect(nextSend(on, sentNov, at("2026-11-20T15:00:00Z"))).toMatchObject({ date: { year: 2026, month: 12, day: 15 }, reference: { month: 12 } });
  });
});
