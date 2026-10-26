import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// #356: o lote do lembrete Newgang é limitado a 300 (a CI não corre Deno; este teste apanha regressões).
const src = readFileSync("supabase/functions/newgang-portal/reminder.ts", "utf8");

describe("#356 lembrete Newgang", () => {
  it("REMINDER_MAX_BATCH = 300", () => {
    expect(src).toMatch(/^export const REMINDER_MAX_BATCH = 300;$/m);
  });
  it("limit_too_large usa a constante", () => {
    expect(src).toMatch(/error: "limit_too_large", max: REMINDER_MAX_BATCH/);
  });
});
