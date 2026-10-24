import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolveRecipient } from "../../supabase/functions/ugc-ios-reading-watchdog/recipient";

const PID = "00000000-0000-4000-8000-000000000abc";
const PHONE = "+000000000000";
const row = (o: Partial<{ phone_number: string | null; opted_in_at: string | null; opted_out_at: string | null }> = {}) => ({
  profile_id: PID, phone_number: PHONE, opted_in_at: "2026-01-01T00:00:00Z", opted_out_at: null, ...o,
});

describe("resolveRecipient", () => {
  it("ok com opt-in ativo", () => {
    expect(resolveRecipient({ recipient_profile_id: PID }, row())).toEqual({ ok: true, phone: PHONE, profile_id: PID });
  });
  it("sem opt-in (linha ausente ou opted_in_at nulo)", () => {
    expect(resolveRecipient({ recipient_profile_id: PID }, null)).toEqual({ ok: false, reason: "sem_optin" });
    expect(resolveRecipient({ recipient_profile_id: PID }, row({ opted_in_at: null }))).toEqual({ ok: false, reason: "sem_optin" });
  });
  it("opt-out", () => {
    expect(resolveRecipient({ recipient_profile_id: PID }, row({ opted_out_at: "2026-02-01T00:00:00Z" }))).toEqual({ ok: false, reason: "optout" });
  });
  it("sem telefone", () => {
    expect(resolveRecipient({ recipient_profile_id: PID }, row({ phone_number: "" }))).toEqual({ ok: false, reason: "sem_telefone" });
  });
  it("sem perfil", () => {
    expect(resolveRecipient({ recipient_profile_id: null }, row())).toEqual({ ok: false, reason: "sem_perfil" });
  });
});

describe("index.ts não lê recipient_phone da config", () => {
  it("tipos de ugc_watchdog_config não reintroduzem recipient_phone", () => {
    const types = readFileSync("src/integrations/supabase/types.ts", "utf8");
    const start = types.indexOf("      ugc_watchdog_config: {");
    expect(start).toBeGreaterThan(-1);
    const remainder = types.slice(start);
    const end = remainder.indexOf("\n      }", 1);
    expect(end).toBeGreaterThan(-1);
    const block = remainder.slice(0, end);
    expect(block).toContain("Row:");
    expect(block).toContain("Insert:");
    expect(block).toContain("Update:");
    expect(block).not.toContain("recipient_phone");
  });
  it("recipient_phone só aparece no insert em notification_queue", () => {
    const src = readFileSync("supabase/functions/ugc-ios-reading-watchdog/index.ts", "utf8");
    const start = src.indexOf('from("notification_queue").insert(');
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf("});", start);
    const outside = src.slice(0, start) + src.slice(end);
    expect(outside).not.toContain("recipient_phone");
    expect(src.slice(start, end)).toContain("recipient_phone: recipient.phone");
  });
});
