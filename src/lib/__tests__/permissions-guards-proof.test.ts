import { describe, it, expect } from "vitest";
import snap from "@/test/fixtures/permission-snapshot-311.json";
import { accessByRole, accessByPermission } from "@/lib/access";

type Row = { u: string; c: string; r: string; p: string[] | null };

describe("#311 F2b — prova: guardas antigas (papel) = novas (permissão)", () => {
  // #311 F2b BLOQUEADA (12/10): a prova encontrou diferenças por decidir pelo Pedro
  // (Portal do Sócio sem guarda, marketing_manager no ERP, editores na Operação,
  // manager em settings.chart_of_accounts). Reactivar quando a matriz for acertada.
  it("cada utilizador real × empresa tem exactamente o mesmo acesso", () => {
    const diffs: string[] = [];
    for (const row of (snap as { rows: Row[] }).rows) {
      const perms = row.p ?? [];
      const a = accessByRole(row.r, perms);
      const b = accessByPermission(row.r, perms);
      const lost = [...a].filter((x) => !b.has(x));
      const gained = [...b].filter((x) => !a.has(x));
      if (lost.length || gained.length)
        diffs.push(`${row.u}@${row.c} ${row.r} | perde: ${lost.join(",") || "-"} | ganha: ${gained.join(",") || "-"}`);
    }
    expect(diffs.join("\n"), `\n${diffs.join("\n")}\n`).toBe("");
  });
});
