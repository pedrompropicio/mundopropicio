import { describe, expect, it } from "vitest";
import { isEventRealized } from "@/lib/event-realized";

const today = new Date(2026, 8, 20); // 20/09/2026 local

describe("isEventRealized (#227)", () => {
  it("status completed → realizado, mesmo com data futura", () => {
    expect(isEventRealized({ status: "completed", date: "2027-01-01" }, today)).toBe(true);
  });
  it("data passada → realizado", () => {
    expect(isEventRealized({ status: "active", date: "2026-09-05" }, today)).toBe(true);
  });
  it("data futura → não realizado", () => {
    expect(isEventRealized({ status: "active", date: "2026-11-21" }, today)).toBe(false);
  });
  it("Master com sub-evento futuro → não realizado", () => {
    expect(
      isEventRealized({ status: "active", date: "2026-09-01", childDates: ["2026-09-02", "2026-12-10"] }, today),
    ).toBe(false);
  });
  it("hoje → ainda não realizado", () => {
    expect(isEventRealized({ status: "active", date: "2026-09-20" }, today)).toBe(false);
  });
  it("sem datas e sem completed → não realizado", () => {
    expect(isEventRealized({ status: "planning" }, today)).toBe(false);
  });
});
