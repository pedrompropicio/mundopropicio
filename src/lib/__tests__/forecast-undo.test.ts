import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ amount: vi.fn(), from: vi.fn(), update: vi.fn(), calls: [] as string[] }));
vi.mock("@/lib/forecast-amount", () => ({
  writeForecastAmount: mocks.amount,
  ForecastBelowRealizedError: class extends Error {},
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
import { executeUndo } from "../undo";

describe("#248 undo inline preserves #240 guards", () => {
  beforeEach(() => {
    mocks.calls.length = 0;
    mocks.amount.mockReset();
    mocks.update.mockReset();
    mocks.from.mockImplementation((table: string) => {
      const chain: any = {
        select: () => chain, eq: () => chain, is: () => chain,
        single: async () => ({ data: { id: "undo", action_type: "edit_forecast", entity_id: "line",
          payload: { snapshot: { amount: 100, description: "Before" } } }, error: null }),
        update: (payload: any) => { mocks.calls.push(table); mocks.update(payload); return chain; },
        then: (resolve: any) => resolve({ error: null }),
      };
      return chain;
    });
  });
  it("requests interactive amount restoration before other fields", async () => {
    mocks.amount.mockImplementation(async () => { mocks.calls.push("amount"); });
    await executeUndo("undo", { id: "user" });
    expect(mocks.amount).toHaveBeenCalledWith({ forecastId: "line", newAmount: 100, interactive: true });
    expect(mocks.calls).toEqual(["amount", "event_forecasts", "undo_actions"]);
  });
  it("cancelled/blocked reduction restores no metadata and never marks undone", async () => {
    mocks.amount.mockRejectedValue(new Error("Observação cancelada"));
    await expect(executeUndo("undo", { id: "user" })).rejects.toThrow("Observação cancelada");
    expect(mocks.update).not.toHaveBeenCalled();
  });
});