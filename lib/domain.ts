export type SplitMember = { userId: string; shareCents?: number | null };

export class ValidationError extends Error {}

export function currentMonth(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function nextMonth(month: string): string {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, value, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function previousMonth(month: string): string {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, value - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function dueDate(month: string, day: number): string {
  const [year, value] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, value, 0)).getUTCDate();
  return `${month}-${String(Math.min(Math.max(day, 1), lastDay)).padStart(2, "0")}`;
}

export function splitTotal(totalCents: number, members: SplitMember[], mode: "equal" | "custom"): Map<string, number> {
  if (!Number.isInteger(totalCents) || totalCents <= 0) throw new Error("O valor total deve ser positivo.");
  if (!members.length) throw new Error("Inclua ao menos um participante no rateio.");
  if (new Set(members.map((member) => member.userId)).size !== members.length) throw new Error("Há participantes duplicados.");

  if (mode === "custom") {
    const entries = members.map((member) => [member.userId, member.shareCents] as const);
    if (entries.some(([, value]) => !Number.isInteger(value) || Number(value) < 0)) throw new Error("Informe valores válidos para todas as pessoas.");
    const sum = entries.reduce((total, [, value]) => total + Number(value), 0);
    if (sum !== totalCents) throw new Error("Os valores individuais precisam somar exatamente o total.");
    return new Map(entries.map(([id, value]) => [id, Number(value)]));
  }

  const base = Math.floor(totalCents / members.length);
  let remainder = totalCents - base * members.length;
  return new Map(members.map((member) => [member.userId, base + (remainder-- > 0 ? 1 : 0)]));
}

export function validateMonth(month: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Mês inválido.");
  return month;
}

export function chargeIsLate(due: string, status: string, today = new Date()): boolean {
  const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return status !== "confirmed" && due < localToday;
}

export function normalizeWhatsApp(value: string | null | undefined): string | null {
  const digits = value?.replace(/\D/g, "") ?? "";
  if (!digits) return null;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  throw new ValidationError("Informe um WhatsApp brasileiro válido, com DDD.");
}
