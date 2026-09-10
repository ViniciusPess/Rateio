import test from "node:test";
import assert from "node:assert/strict";
import { chargeIsLate, dueDate, nextMonth, normalizeWhatsApp, previousMonth, splitTotal } from "../lib/domain.ts";

test("a divisão igual distribui centavos e preserva exatamente o total", () => {
  const result = splitTotal(1000, [{ userId: "a" }, { userId: "b" }, { userId: "c" }], "equal");
  assert.deepEqual([...result.values()], [334, 333, 333]);
  assert.equal([...result.values()].reduce((sum, value) => sum + value, 0), 1000);
});

test("a divisão personalizada recusa soma diferente do total", () => {
  assert.throws(() => splitTotal(1000, [{ userId: "a", shareCents: 500 }, { userId: "b", shareCents: 499 }], "custom"), /somar exatamente/);
});

test("a cobrança com vencimento no dia 31 usa o último dia real do mês", () => {
  assert.equal(dueDate("2027-02", 31), "2027-02-28");
  assert.equal(dueDate("2028-02", 31), "2028-02-29");
});

test("mudanças mensais atravessam virada de ano sem perder ordenação", () => {
  assert.equal(nextMonth("2026-12"), "2027-01");
  assert.equal(previousMonth("2027-01"), "2026-12");
});

test("pagamento informado continua vencido até ser confirmado", () => {
  const today = new Date("2026-09-09T12:00:00");
  assert.equal(chargeIsLate("2026-09-08", "reported", today), true);
  assert.equal(chargeIsLate("2026-09-08", "confirmed", today), false);
});

test("o WhatsApp é normalizado para o formato internacional brasileiro", () => {
  assert.equal(normalizeWhatsApp("(21) 99999-0002"), "5521999990002");
  assert.equal(normalizeWhatsApp("+55 21 99999-0002"), "5521999990002");
  assert.equal(normalizeWhatsApp(""), null);
});

test("o WhatsApp recusa números sem DDD ou com tamanho inválido", () => {
  assert.throws(() => normalizeWhatsApp("99999-0002"), /WhatsApp brasileiro válido/);
});
