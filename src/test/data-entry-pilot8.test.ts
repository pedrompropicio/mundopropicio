import { describe, expect, it, vi } from "vitest";
vi.mock("npm:zod@3", async () => import("zod"));
import { createHandler, type Deps } from "../../supabase/functions/data-entry/handler";

const owner = "22222222-2222-4222-8222-222222222222";
const company = "11111111-1111-4111-8111-111111111111";
const session = "33333333-3333-4333-8333-333333333333";
function harness(result: { data: unknown; error: { code: string; message: string } | null }) {
  const upload = vi.fn(async () => ({ error: null }));
  const receipt = vi.fn(async () => ({ data: null, error: null }));
  const rpc = vi.fn(async (_token: string, name: string) => name === "my_effective_permissions"
    ? { data: { role: "manager", company_id: company }, error: null }
    : name === "data_entry_pilot8_capabilities" ? result
      : { data: { session: { id: session }, company: { id: company } }, error: null });
  const deps: Deps = { pilotScoped: true, uploadEnabled: true, cors: {}, getUser: async () => ({ id: owner }),
    userRpc: rpc, recordReceipt: receipt, storage: { upload, download: async () => null } };
  const handler = createHandler(deps);
  const send = (body: object) => handler(new Request("http://local.invalid", { method: "POST",
    headers: { Authorization: "Bearer local-fixture", "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  return { send, upload, receipt, rpc };
}

describe("#333 pilot candidate fail-closed", () => {
  it("missing capability SQL returns unavailable without using global uploadEnabled", async () => {
    const h = harness({ data: null, error: { code: "PGRST202", message: "private database topology" } });
    const status = await h.send({ action: "status" });
    expect(status.status).toBe(200);
    const body = await status.json();
    expect(body.capabilities.upload).toBe(false);
    expect(body.capabilities.unavailable).toBe(true);
    expect(JSON.stringify(body)).not.toContain("database topology");
    expect((await h.send({ action: "session" })).status).toBe(503);
    expect(h.upload).not.toHaveBeenCalled();
    expect(h.receipt).not.toHaveBeenCalled();
  });
  it("malformed capability cannot authorize preparation", async () => {
    const h = harness({ data: { preparation: "true", execute: true }, error: null });
    expect((await h.send({ action: "session" })).status).toBe(503);
    expect(h.upload).not.toHaveBeenCalled();
  });
  it("owner existing-session read survives revoked preparation without new effects", async () => {
    const h = harness({ data: { preparation: false, execute: false }, error: null });
    expect((await h.send({ action: "session", session_id: session })).status).toBe(200);
    expect(h.rpc).toHaveBeenCalledWith("local-fixture", "data_entry_session", { p_session: session, p_event: null });
    expect((await h.send({ action: "session" })).status).toBe(503);
    expect(h.upload).not.toHaveBeenCalled();
    expect(h.receipt).not.toHaveBeenCalled();
  });
  it("capability permission rejection stays closed and never discloses SQL error", async () => {
    const h = harness({ data: null, error: { code: "42501", message: "private SQL role" } });
    const response = await h.send({ action: "status" });
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain("SQL role");
    expect(h.upload).not.toHaveBeenCalled();
  });
});