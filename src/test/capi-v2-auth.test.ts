// @vitest-environment node
// CI410: real canonical guard + real handler; all tokens/signatures are local.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isServiceRoleRequest } from "../../supabase/functions/_shared/multiTenant";
import { createHandler } from "../../supabase/functions/capi-v2-send/handler";

const AUTH_ORIGIN = "https://auth.example.invalid";
const enc = new TextEncoder();
const b64 = (s: string | Uint8Array) => Buffer.from(s).toString("base64url");

describe("CI410 — canonical service-role trust boundary, offline", () => {
  let key: CryptoKey;
  let serviceToken: string;
  let anonToken: string;
  let userToken: string;
  let authFetch: ReturnType<typeof vi.fn>;
  let runtimeKey: string | undefined;

  async function sign(role: string) {
    const unsigned = `${b64(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64(JSON.stringify({ role, exp: 4102444800 }))}`;
    const signature = await crypto.subtle.sign("HMAC", key, enc.encode(unsigned));
    return `${unsigned}.${b64(new Uint8Array(signature))}`;
  }

  beforeEach(async () => {
    key = await crypto.subtle.generateKey({ name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    serviceToken = await sign("service_role");
    anonToken = await sign("anon");
    userToken = await sign("authenticated");
    runtimeKey = undefined;
    vi.stubGlobal("Deno", { env: { get: (name: string) => {
      if (name === "SUPABASE_URL") return AUTH_ORIGIN;
      if (name === "SUPABASE_SERVICE_ROLE_KEY") return runtimeKey;
      return undefined;
    } } });
    authFetch = vi.fn(async (url: string, init: RequestInit) => {
      // Never use the real Auth/Graph network. Simulated Auth verifies signature,
      // not merely the untrusted role claim, against an ephemeral local key.
      expect(url).toBe(`${AUTH_ORIGIN}/auth/v1/admin/users?per_page=1`);
      const headers = new Headers(init.headers);
      const token = headers.get("apikey") ?? "";
      expect(headers.get("Authorization")).toBe(`Bearer ${token}`);
      const [header, payload, signature] = token.split(".");
      if (!header || !payload || !signature) return new Response("{}", { status: 401 });
      const valid = await crypto.subtle.verify("HMAC", key, Buffer.from(signature, "base64url"), enc.encode(`${header}.${payload}`));
      const role = JSON.parse(Buffer.from(payload, "base64url").toString()).role;
      return new Response("{}", { status: valid && role === "service_role" ? 200 : 401 });
    });
    vi.stubGlobal("fetch", authFetch);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  const request = (token?: string, action = "health") => new Request("https://local.example.invalid/capi-v2-send", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify({ action, confirm_test: true, override_suspension_for_test: true }),
  });

  it.each(["health", "dry_run", "send"])("%s rejects missing/anon/user/forged tokens before body, data, config or effects", async (action) => {
    const forged = `${serviceToken.split(".").slice(0, 2).join(".")}.${b64(new Uint8Array(32))}`;
    const rpc = vi.fn();
    const from = vi.fn();
    const graph = vi.fn();
    const env = vi.fn();
    const now = vi.fn();
    const handle = createHandler({ sb: { rpc, from }, fetchFn: graph, env, now, isServiceRole: isServiceRoleRequest });
    for (const token of [undefined, anonToken, userToken, "invalid-token", forged]) {
      const req = request(token, action);
      const readBody = vi.spyOn(req, "text");
      const response = await handle(req);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "service_role_only" });
      expect(readBody).not.toHaveBeenCalled();
    }
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
    expect(graph).not.toHaveBeenCalled();
    expect(env).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
    expect(authFetch).toHaveBeenCalledTimes(1); // Only forged service claim reaches Auth.
  });

  it("accepts service-role only after simulated Auth cryptographically verifies it", async () => {
    expect(await isServiceRoleRequest(request(serviceToken))).toBe(true);
    expect(authFetch).toHaveBeenCalledTimes(1);
  });

  it("accepts exact runtime service key but not a different signed token", async () => {
    runtimeKey = serviceToken;
    expect(await isServiceRoleRequest(request(serviceToken))).toBe(true);
    expect(await isServiceRoleRequest(request(userToken))).toBe(false);
    expect(authFetch).not.toHaveBeenCalled();
  });

  it("fails closed when Auth refuses or is unavailable", async () => {
    authFetch.mockResolvedValueOnce(new Response("{}", { status: 403 }));
    expect(await isServiceRoleRequest(request(serviceToken))).toBe(false);
    authFetch.mockRejectedValueOnce(new Error("offline auth unavailable"));
    expect(await isServiceRoleRequest(request(serviceToken))).toBe(false);
  });
});