#!/usr/bin/env node
/**
 * Canário runtime do portão verify_jwt (#283 / D-ERP206).
 * Uma leitura de config.toml NÃO prova a definição implantada: esta sonda envia
 * um JWT com assinatura inválida e exige a resposta do portão, antes do código.
 *
 * Uso: bun scripts/probe-edge-jwt-gate.mjs
 * CI: requer EDGE_GATE_BASE_URL e EDGE_GATE_ANON_KEY (segredo). Sem ambos falha
 * explicitamente — nunca reporta cobertura verde sem rede/credenciais.
 */
const base = process.env.EDGE_GATE_BASE_URL?.replace(/\/$/, "");
const anon = process.env.EDGE_GATE_ANON_KEY;
if (!base || !anon) {
  console.error("SKIP PROIBIDO: configure EDGE_GATE_BASE_URL e EDGE_GATE_ANON_KEY para sondar o portão em runtime.");
  process.exit(2);
}
const b64 = (s) => Buffer.from(s).toString("base64url");
const forged = `${b64(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64(JSON.stringify({ sub: "00000000-0000-0000-0000-000000000000", role: "service_role", exp: 4102444800 }))}.forged-signature`;
const fn = process.env.EDGE_GATE_CANARY_FUNCTION || "crm-meta-create-purchase-audience";
const res = await fetch(`${base}/functions/v1/${fn}`, {
  method: "POST",
  headers: { apikey: anon, Authorization: `Bearer ${forged}`, "Content-Type": "application/json" },
  body: "{}",
});
const body = await res.text();
const expected = '{"code":"UNAUTHORIZED_LEGACY_JWT","message":"Invalid JWT"}';
console.log(`${fn} -> ${body} [${res.status}]`);
if (res.status !== 401 || body.trim() !== expected) {
  console.error("FALHA: a resposta não veio do portão verify_jwt; a declaração pode não ter sido reimplantada.");
  process.exit(1);
}
