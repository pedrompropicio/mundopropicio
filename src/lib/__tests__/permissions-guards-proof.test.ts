import { describe, it, expect } from "vitest";
import snap from "@/test/fixtures/permission-snapshot-311.json";
import { accessByRole, accessByPermission, type AccessArea } from "@/lib/access";

type Row = { u: string; c: string; r: string; p: string[] | null };

// Diferenças aceites pelo Pedro (12/10, D-ERP254 adenda F2b):
// 1. Portal do Sócio fecha a quem não é sócio nem admin.
// 2. marketing_manager sem module.erp deixa de abrir o ERP (e áreas que dependem dele).
const ERP_DEPENDENT: AccessArea[] = [
  "erp", "operacao", "settings.bp_tools", "settings.audit_accounts", "settings.accounts",
  "settings.chart_of_accounts", "settings.ticket_offices",
];
function allowedLoss(role: string, area: AccessArea): boolean {
  if (area === "partner_portal" && !["partner", "admin", "platform_admin"].includes(role)) return true;
  if (role === "marketing_manager" && ERP_DEPENDENT.includes(area)) return true;
  return false;
}

describe("#311 F2b — prova: guardas antigas (papel) = novas (permissão)", () => {
  it("cada utilizador real × empresa tem exactamente o mesmo acesso (salvo excepções aceites)", () => {
    const diffs: string[] = [];
    for (const row of (snap as { rows: Row[] }).rows) {
      const perms = row.p ?? [];
      const a = accessByRole(row.r, perms);
      const b = accessByPermission(row.r, perms);
      const lost = [...a].filter((x) => !b.has(x) && !allowedLoss(row.r, x));
      const gained = [...b].filter((x) => !a.has(x));
      if (lost.length || gained.length)
        diffs.push(`${row.u}@${row.c} ${row.r} | perde: ${lost.join(",") || "-"} | ganha: ${gained.join(",") || "-"}`);
    }
    expect(diffs.join("\n"), `\n${diffs.join("\n")}\n`).toBe("");
  });
});
