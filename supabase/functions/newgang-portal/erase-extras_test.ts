import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { eraseExtras } from "./erase-extras.ts";
const deps = (o: Partial<Parameters<typeof eraseExtras>[0]> = {}) => ({ proofPaths: async () => [], removeProofs: async () => true, hasWalletPass: async () => false, expireWallet: async () => true, ...o });
Deno.test("sem provas nem passe: nada é chamado", async () => {
  let calls = 0;
  assertEquals(await eraseExtras(deps({ removeProofs: async () => (calls++, true), expireWallet: async () => (calls++, true) })), { storage_removed: 0, storage: "none", wallet: "none" });
  assertEquals(calls, 0);
});
Deno.test("remove só os caminhos do membro e expira o Wallet", async () => {
  let got: string[] = [];
  const r = await eraseExtras(deps({ proofPaths: async () => ["m/1.jpg", "", "m/2.jpg"], removeProofs: async (p) => (got = p, true), hasWalletPass: async () => true }));
  assertEquals(got, ["m/1.jpg", "m/2.jpg"]);
  assertEquals(r, { storage_removed: 2, storage: "ok", wallet: "expired" });
});
Deno.test("falhas de storage/Wallet não lançam (o apagamento na BD continua)", async () => {
  const r = await eraseExtras(deps({ proofPaths: async () => { throw new Error("x"); }, hasWalletPass: async () => true, expireWallet: async () => { throw new Error("y"); } }));
  assertEquals(r, { storage_removed: 0, storage: "failed", wallet: "failed" });
});
