// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const core = readFileSync("supabase/manual/20261021_issue335_offset_core.INERTE.sql", "utf8");
const reconciliation = readFileSync("drizzle/migrations/0301_issue401_reconcile_bank_line_devolucao.sql", "utf8");

function definition(source: string, name: string, ending = "END $$;") {
  // Anchor at the start of a line: the commented rollback in 0301 is not executable SQL.
  const start = source.search(new RegExp(`^CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\(`, "m"));
  expect(start, name).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(ending, start);
  expect(end, `${name}: closing delimiter`).toBeGreaterThan(start);
  return source.slice(start, end + ending.length);
}

describe("#337 E2b critério 1 — núcleo independente da porta de entrada", () => {
  it("recebe o movimento opcional e exige conta sem depender de uma linha do banco", () => {
    const execute = definition(core, "_issue335_execute");
    expect(execute).not.toMatch(/bank_statement_lines|bank_line|p_line_id/i);
    expect(execute).toContain("IF p_movement IS NULL");
    expect(execute).toContain("acc IS NULL");
  });

  it("a definição activa de 0301 entrega o movimento bancário ao mesmo núcleo", () => {
    const adapter = definition(reconciliation, "reconcile_bank_line", "$function$\n;");
    expect(adapter).toMatch(/public\._issue335_execute\(v_request,\s*v_supplier,\s*p_items,\s*jsonb_build_object\('account_id',\s*v_line\.financial_account_id/);
    expect(adapter).toContain("'amount',v_line.amount");
  });

  it("a porta lançamento despacha execute e o worker passa o movimento ao núcleo", () => {
    const launch = definition(core, "transaction_offset_execute");
    const dispatch = definition(core, "issue335_dispatch");
    const worker = definition(core, "issue335_worker");
    expect(launch).toMatch(/INSERT INTO public\.issue335_commands\(command\).*jsonb_build_object\('op','execute'/s);
    expect(launch).toContain("'movement',p_movement");
    expect(core).toMatch(/CREATE TRIGGER issue335_dispatch INSTEAD OF INSERT ON public\.issue335_commands FOR EACH ROW EXECUTE FUNCTION public\.issue335_dispatch\(\)/);
    expect(dispatch).toContain("public.issue335_worker(NEW.command)");
    expect(worker).toMatch(/IF p_command->>'op'='execute' THEN\s+result:=public\._issue335_execute\(/);
    expect(worker).toContain("NULLIF(p_command->'movement','null'::jsonb)");
  });
});
