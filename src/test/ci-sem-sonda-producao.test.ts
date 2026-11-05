import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";

// #388 — o CI geral (push, pull_request, cron) não chama produção nem consome
// credenciais de produção. A sonda remota do portão verify_jwt vive num
// workflow próprio, só manual e com confirmação explícita. O comportamento da
// sonda é provado aqui contra um servidor local (nunca contra a rede).

const root = resolve(__dirname, "../..");
const ci = readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8");
const probeWf = readFileSync(resolve(root, ".github/workflows/edge-jwt-probe.yml"), "utf8");
const script = resolve(root, "scripts/probe-edge-jwt-gate.mjs");

/** Linhas que não são comentário YAML. */
const code = (yml: string) =>
  yml.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");

/** Bloco de topo `on:` até à próxima chave de topo. */
function onBlock(yml: string): string {
  const lines = code(yml).split("\n");
  const start = lines.findIndex((l) => /^on:\s*$/.test(l));
  expect(start, "workflow sem bloco on:").toBeGreaterThanOrEqual(0);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^\S/.test(l));
  return rest.slice(0, end === -1 ? undefined : end).join("\n");
}

describe("#388 — CI geral sem sonda de produção", () => {
  it("ci.yml não usa EDGE_GATE_*, a sonda nem nenhum secret", () => {
    const c = code(ci);
    expect(c).not.toMatch(/EDGE_GATE_/);
    expect(c).not.toMatch(/probe-edge-jwt-gate/);
    expect(c).not.toMatch(/secrets\./);
    expect(c).not.toMatch(/https?:\/\/[^\s]*supabase\.co/);
  });

  it("o workflow da sonda só corre por workflow_dispatch, com confirmação SONDAR", () => {
    const on = onBlock(probeWf);
    expect(on).toMatch(/^\s+workflow_dispatch:/m);
    expect(on).not.toMatch(/\b(push|pull_request|pull_request_target|schedule|workflow_run|repository_dispatch)\s*:/);
    expect(code(probeWf)).toMatch(/if:\s*\$\{\{\s*inputs\.confirmar == 'SONDAR'\s*\}\}/);
    expect(code(probeWf)).toMatch(/destino:/);
    expect(code(probeWf)).toMatch(/bun scripts\/probe-edge-jwt-gate\.mjs/);
  });

  it("nenhum outro workflow consome EDGE_GATE_*", () => {
    for (const f of ["executor.yml", "baseline-352-static.yml"]) {
      let y = "";
      try { y = readFileSync(resolve(root, ".github/workflows", f), "utf8"); } catch { continue; }
      expect(code(y), f).not.toMatch(/EDGE_GATE_/);
    }
  });
});

// ── Comportamento da sonda contra servidor local ───────────────────────────

const EXPECTED = '{"code":"UNAUTHORIZED_LEGACY_JWT","message":"Invalid JWT"}';

function runProbe(env: Record<string, string>): Promise<{ code: number | null; out: string }> {
  return new Promise((res) => {
    const base = { ...process.env };
    delete base.EDGE_GATE_BASE_URL;
    delete base.EDGE_GATE_ANON_KEY;
    const p = spawn(process.execPath, [script], { env: { ...base, ...env } });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) => res({ code, out }));
  });
}

async function withServer(
  handler: (auth: string | undefined) => { status: number; body: string },
  fn: (url: string) => Promise<void>,
) {
  const server: Server = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      const r = handler(req.headers.authorization);
      res.writeHead(r.status, { "Content-Type": "application/json" });
      res.end(r.body);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

describe("#388 — sonda verify_jwt (servidor local, sem rede)", () => {
  it("sem secrets termina com erro explícito (nunca verde)", async () => {
    const r = await runProbe({});
    expect(r.code).toBe(2);
    expect(r.out).toMatch(/SKIP PROIBIDO/);
  });

  it("portão a responder 401 UNAUTHORIZED_LEGACY_JWT ⇒ sucesso; o JWT enviado é forjado", async () => {
    let seen: string | undefined;
    await withServer((auth) => { seen = auth; return { status: 401, body: EXPECTED }; }, async (url) => {
      const r = await runProbe({ EDGE_GATE_BASE_URL: url, EDGE_GATE_ANON_KEY: "anon-teste" });
      expect(r.code, r.out).toBe(0);
    });
    expect(seen).toMatch(/^Bearer .+\..+\.forged-signature$/);
  });

  it("resposta que não vem do portão (código da função) ⇒ falha", async () => {
    await withServer(() => ({ status: 401, body: '{"error":"unauthorized"}' }), async (url) => {
      const r = await runProbe({ EDGE_GATE_BASE_URL: url, EDGE_GATE_ANON_KEY: "anon-teste" });
      expect(r.code).toBe(1);
      expect(r.out).toMatch(/FALHA/);
    });
  });

  it("200 (portão desligado) ⇒ falha", async () => {
    await withServer(() => ({ status: 200, body: "{}" }), async (url) => {
      const r = await runProbe({ EDGE_GATE_BASE_URL: url, EDGE_GATE_ANON_KEY: "anon-teste" });
      expect(r.code).toBe(1);
    });
  });
});
