// #356: lotes acima de 300 rejeitados antes de qualquer efeito. Credential-free.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { clampLimit, REMINDER_MAX_BATCH, reminderLimitError } from "./reminder.ts";

Deno.test("#356 máximo único é 300", () => assertEquals(REMINDER_MAX_BATCH, 300));

Deno.test("#356 limit 301 e 500 rejeitados com erro estável", () => {
  for (const v of [301, 500, 300.5 + 1, 1e9]) assertEquals(reminderLimitError(v), { error: "limit_too_large", max: 300 });
});

Deno.test("#356 limit 300 e omitido mantêm comportamento", () => {
  assertEquals(reminderLimitError(300), null); assertEquals(clampLimit(300), 300);
  assertEquals(reminderLimitError(undefined), null); assertEquals(clampLimit(undefined), 0);
  assertEquals(reminderLimitError(50), null); assertEquals(clampLimit(50), 50);
});

Deno.test("#356 inválidos (0, negativo, não numérico) inalterados", () => {
  for (const v of [0, -5, "500", "abc", null, NaN, Infinity]) assertEquals(reminderLimitError(v), null);
  assertEquals([clampLimit(0), clampLimit(-5), clampLimit("500"), clampLimit(NaN)], [0, 0, 0, 0]);
});

Deno.test("#356 handler valida antes de notifyReminders (sem leitura, reserva ou envio)", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const guard = src.indexOf("reminderLimitError(b.limit)");
  const call = src.indexOf("await notifyReminders(site, b)");
  assert(guard > 0 && call > guard, "guarda tem de vir antes da chamada");
  assert(src.slice(guard, call).includes("json(tooLarge, 400)"));
  assert(!src.slice(guard, call).includes("sb."), "nenhum acesso à BD entre a guarda e a chamada");
});
