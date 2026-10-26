// #368 fase 2: antes da RPC de apagamento real, remove as provas do membro no storage
// e invalida o objeto Google Wallet (a Google não permite apagar; state=EXPIRED).
// Falhas aqui nunca impedem o apagamento na base de dados; ficam assinaladas para repetir.
export type EraseDeps = {
  proofPaths: () => Promise<string[]>;
  removeProofs: (paths: string[]) => Promise<boolean>;
  hasWalletPass: () => Promise<boolean>;
  expireWallet: () => Promise<boolean>;
};
export type EraseExtras = { storage_removed: number; storage: "ok" | "none" | "failed"; wallet: "expired" | "none" | "failed" };

export async function eraseExtras(d: EraseDeps): Promise<EraseExtras> {
  const out: EraseExtras = { storage_removed: 0, storage: "none", wallet: "none" };
  try {
    const paths = (await d.proofPaths()).filter((p) => typeof p === "string" && p.length > 0);
    if (paths.length) {
      out.storage = (await d.removeProofs(paths)) ? "ok" : "failed";
      if (out.storage === "ok") out.storage_removed = paths.length;
    }
  } catch { out.storage = "failed"; }
  try {
    if (await d.hasWalletPass()) out.wallet = (await d.expireWallet()) ? "expired" : "failed";
  } catch { out.wallet = "failed"; }
  return out;
}

/** Contrato público da resposta de erase_account (#368): wallet "expired" ⇒ "ok"; simulação ⇒ none/none. */
export type ResponseExtras = { storage: "ok" | "failed" | "none"; wallet: "ok" | "failed" | "none" };
export function responseExtras(x: EraseExtras | null): ResponseExtras {
  if (!x) return { storage: "none", wallet: "none" };
  return { storage: x.storage, wallet: x.wallet === "expired" ? "ok" : x.wallet };
}
