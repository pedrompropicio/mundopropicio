// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createR2Client } from "../../supabase/functions/_shared/r2";

const config = {
  accountId: "0123456789abcdef0123456789abcdef",
  accessKeyId: "synthetic-access-key-202g",
  secretAccessKey: "synthetic-secret-key-202g",
  bucket: "synthetic-bucket-202g",
};
const privateObject = "private-folder/private-object-202g.json";
const privateBody = `<Message>${Object.values(config).join(" ")} ${privateObject}</Message>`;
const xmlError = (code: string) => `<Error><Code>${code}</Code>${privateBody}</Error>`;

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Rede proibida no teste #202-g"); }));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.doUnmock("npm:@supabase/supabase-js@2");
});

describe("#202-g sonda R2 assinada e sem corpo no resultado (critérios 1 e 4)", () => {
  it.each([undefined, "eu", "default"] as const)("usa endpointKind=%s e listagem path-style assinada", async (endpointKind) => {
    const fetchImpl = vi.fn(async () => new Response(xmlError("NoSuchBucket"), { status: 404 }));
    const client = createR2Client({ ...config, endpointKind, fetchImpl });
    expect(await client.probe()).toEqual({ status: 404, code: "NoSuchBucket" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [input, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const url = new URL(input);
    expect(url.host).toBe(`${config.accountId}.${endpointKind === "default" ? "" : "eu."}r2.cloudflarestorage.com`);
    expect(url.pathname).toBe(`/${config.bucket}`);
    expect([...url.searchParams].sort()).toEqual([["list-type", "2"], ["max-keys", "1"]]);
    expect(init.method).toBe("GET");
    expect(init.redirect).toBe("error");
    expect(init.body).toBeUndefined();
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 /);
    expect(headers.get("authorization")).toContain("/auto/s3/aws4_request");
    expect(headers.get("x-amz-date")).toMatch(/^\d{8}T\d{6}Z$/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("ignora o corpo de sucesso, mesmo com nomes de objectos e um Code", async () => {
    const response = new Response(`<ListBucketResult><Key>${privateObject}</Key>${xmlError("Ignored")}</ListBucketResult>`);
    const readBody = vi.spyOn(response, "text");
    const client = createR2Client({ ...config, fetchImpl: vi.fn(async () => response) });
    expect(await client.probe()).toEqual({ status: 200, code: null });
    expect(readBody).not.toHaveBeenCalled();
  });

  it.each(["", privateBody, "<Error><Code></Code></Error>"])("não devolve corpo sem código S3: %s", async (body) => {
    const client = createR2Client({ ...config, fetchImpl: vi.fn(async () => new Response(body, { status: 400 })) });
    expect(await client.probe()).toEqual({ status: 400, code: null });
  });
});

describe("#202-g diagnóstico de HEAD (critério 2)", () => {
  it("retém o estado 400 do HEAD e extrai InvalidArgument de GET com Range à mesma chave", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 400 }))
      .mockResolvedValueOnce(new Response(xmlError("InvalidArgument"), { status: 403 }));
    const client = createR2Client({ ...config, fetchImpl });
    await expect(client.headObject(privateObject)).rejects.toThrow(/^R2 HEAD 400 \(InvalidArgument\)$/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [[headUrl, head], [getUrl, get]] = fetchImpl.mock.calls;
    expect(head?.method).toBe("HEAD");
    expect(get?.method).toBe("GET");
    expect(getUrl).toBe(headUrl);
    expect(new URL(String(getUrl)).pathname).toBe(`/${config.bucket}/${privateObject}`);
    const headers = new Headers(get?.headers);
    expect(headers.get("range")).toBe("bytes=0-0");
    expect(headers.get("authorization")).toContain("SignedHeaders=host;range;x-amz-content-sha256;x-amz-date");
  });

  it("mantém HEAD 404 como null sem GET adicional", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 404 }));
    expect(await createR2Client({ ...config, fetchImpl }).headObject(privateObject)).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("mantém tamanho e metadados do HEAD 200 sem GET adicional", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, {
      headers: { "content-length": "123", "x-amz-meta-sha256": "fixture-hash" },
    }));
    expect(await createR2Client({ ...config, fetchImpl }).headObject(privateObject))
      .toEqual({ size: 123, meta: { sha256: "fixture-hash" } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each(["sem código", "GET bem-sucedido", "falha de transporte"])("não expõe corpo ou erro privado: %s", async (scenario) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 403 }));
    if (scenario === "falha de transporte") fetchImpl.mockRejectedValueOnce(new Error(privateBody));
    else fetchImpl.mockResolvedValueOnce(new Response(privateBody, { status: scenario === "sem código" ? 403 : 206 }));
    await expect(createR2Client({ ...config, fetchImpl }).headObject(privateObject))
      .rejects.toThrow(/^R2 HEAD 403 \(sem código\)$/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

const serviceKey = "synthetic-service-role-key-202g";
const encryptionKey = "synthetic-unused-encryption-key-202g";
const jwt = (role: string) => `fixture.${btoa(JSON.stringify({ role, sub: "fixture-user" }))}.fixture`;

async function handlerFixture(overrides: Record<string, string | undefined> = {}) {
  const env: Record<string, string | undefined> = {
    SUPABASE_URL: "https://backup.invalid",
    SUPABASE_SERVICE_ROLE_KEY: serviceKey,
    BACKUP_R2_ACCOUNT_ID: config.accountId,
    BACKUP_R2_ACCESS_KEY_ID: config.accessKeyId,
    BACKUP_R2_SECRET_ACCESS_KEY: config.secretAccessKey,
    BACKUP_R2_BUCKET: config.bucket,
    BACKUP_R2_ENC_KEY: encryptionKey,
    ...overrides,
  };
  let handler!: (req: Request) => Promise<Response>;
  const getEnv = vi.fn((name: string) => env[name]);
  vi.stubGlobal("Deno", { env: { get: getEnv }, serve: (h: typeof handler) => { handler = h; } });
  const dbCall = vi.fn(() => { throw new Error("A sonda não pode ler nem escrever na base ou no Storage"); });
  vi.doMock("npm:@supabase/supabase-js@2", () => ({ createClient: () => ({ from: dbCall, rpc: dbCall, storage: { from: dbCall } }) }));
  const consoleSpies = (["log", "info", "warn", "error", "debug", "trace"] as const)
    .map((method) => vi.spyOn(console, method).mockImplementation(() => {}));
  const modulePath = "../../supabase/functions/database-backup/index.ts";
  await import(/* @vite-ignore */ modulePath);
  const call = (token = serviceKey) => handler(new Request("https://backup.invalid/database-backup", {
    method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify({ target: "offsite_probe" }),
  }));
  const assertPrivate = (body: unknown) => {
    const logs = consoleSpies.flatMap((spy) => spy.mock.calls.flat()
      .map((value) => value instanceof Error ? value.stack : String(value))).join("\n");
    const output = JSON.stringify(body) + logs;
    for (const value of [...Object.values(config), serviceKey, encryptionKey, privateObject, privateBody]) {
      expect(output).not.toContain(value);
    }
    expect(dbCall).not.toHaveBeenCalled();
  };
  return { call, getEnv, assertPrivate };
}

describe("#202-g acção offsite_probe com handler e guarda reais (critério 3)", () => {
  it.each(["", jwt("anon"), jwt("admin"), jwt("authenticated")])("recusa sem service_role verificada: %s", async (token) => {
    const s = await handlerFixture();
    const response = await s.call(token);
    expect(response.status).toBe(403);
    s.assertPrivate(await response.json());
    expect(fetch).not.toHaveBeenCalled();
    expect(s.getEnv.mock.calls.some(([name]) => name.startsWith("BACKUP_R2_"))).toBe(false);
  });

  it("recusa um JWT com claim service_role rejeitado pelo Auth antes de contactar R2", async () => {
    const s = await handlerFixture();
    const network = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("forged", { status: 401 }));
    vi.stubGlobal("fetch", network);
    const response = await s.call(jwt("service_role"));
    expect(response.status).toBe(403);
    s.assertPrivate(await response.json());
    expect(network).toHaveBeenCalledTimes(1);
    expect(String(network.mock.calls[0][0])).toContain("backup.invalid/auth/v1/admin/users");
    expect(s.getEnv.mock.calls.some(([name]) => name.startsWith("BACKUP_R2_"))).toBe(false);
  });

  it("devolve só estados, códigos e indicadores nos dois endpoints sem escrever", async () => {
    const s = await handlerFixture();
    const network = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe(`/${config.bucket}`);
      expect(init?.method).toBe("GET");
      expect(new Headers(init?.headers).get("authorization")).toMatch(/^AWS4-HMAC-SHA256 /);
      return url.host.includes(".eu.")
        ? new Response(xmlError("InvalidArgument"), { status: 400 })
        : new Response(`<ListBucketResult><Key>${privateObject}</Key></ListBucketResult>`);
    });
    vi.stubGlobal("fetch", network);
    const response = await s.call();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual({ eu: { status: 400, code: "InvalidArgument" }, default: { status: 200, code: null },
      bucket_set: true, account_id_format_ok: true });
    expect(network).toHaveBeenCalledTimes(2);
    expect(network.mock.calls.map(([url]) => new URL(String(url)).host).sort()).toEqual([
      `${config.accountId}.eu.r2.cloudflarestorage.com`, `${config.accountId}.r2.cloudflarestorage.com`,
    ]);
    expect(s.getEnv).not.toHaveBeenCalledWith("BACKUP_R2_ENC_KEY");
    s.assertPrivate(body);
  });

  it.each(["a".repeat(31), "a".repeat(33), "A".repeat(32), "g".repeat(32)])(
    "valida o formato exacto do account ID sem o devolver: %s", async (accountId) => {
      const s = await handlerFixture({ BACKUP_R2_ACCOUNT_ID: accountId, BACKUP_R2_BUCKET: undefined });
      vi.stubGlobal("fetch", vi.fn(async () => new Response(xmlError("AccessDenied"), { status: 403 })));
      const response = await s.call();
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body).toEqual({ eu: { status: 403, code: "AccessDenied" }, default: { status: 403, code: "AccessDenied" },
        bucket_set: false, account_id_format_ok: false });
      expect(JSON.stringify(body)).not.toContain(accountId);
      s.assertPrivate(body);
    },
  );

  it("não deixa erros de transporte privados chegarem ao retorno ou ao console", async () => {
    const s = await handlerFixture();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error(`${privateBody} ${serviceKey} ${encryptionKey}`); }));
    const response = await s.call();
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: "Sonda offsite indisponível" });
    s.assertPrivate(body);
  });
});
