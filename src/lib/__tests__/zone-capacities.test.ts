import { describe, it, expect } from "vitest";
import { latestByZone, totalsByEvent, type ZoneCapacityRow } from "@/lib/zone-capacities";

const row = (zone_label: string, observed_on: string, capacity: number, occupied: number, available: number, event_id = "e1"): ZoneCapacityRow =>
  ({ event_id, zone_label, capacity, occupied, available, blocked: 0, observed_on });

describe("zone-capacities — observação corrente (#198)", () => {
  it("zona que já não aparece na última observação não conta", () => {
    const rows = [
      row("Balcão 1 - Lote 2", "2026-08-23", 2114, 0, 0),
      row("Balcão 1 - Lote 2 - SUPER BOCK ARENA", "2026-09-30", 6368, 5376, 992),
      row("Balcão 1 - Lote 2 - SUPER BOCK ARENA", "2026-09-29", 6368, 5300, 1068),
    ];
    expect(latestByZone(rows)).toHaveLength(1);
    const t = totalsByEvent(rows).get("e1")!;
    expect(t.capacity).toBe(6368);
    expect(t.occupied).toBe(5376);
    expect(t.available).toBe(992);
    expect(t.lastObserved).toBe("2026-09-30");
  });
  it("cada evento usa a sua própria última observação", () => {
    const rows = [row("A", "2026-09-30", 100, 50, 50, "e1"), row("B", "2026-09-28", 200, 20, 180, "e2"), row("B", "2026-09-01", 999, 0, 0, "e2")];
    expect(totalsByEvent(rows).get("e2")!.capacity).toBe(200);
    expect(totalsByEvent(rows).get("e1")!.capacity).toBe(100);
  });
});
