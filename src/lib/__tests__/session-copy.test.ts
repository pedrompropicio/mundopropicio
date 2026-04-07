import { describe, expect, it } from "vitest";
import { buildSessionCopyMap, normalizeSessionLabel } from "../session-copy";

describe("normalizeSessionLabel", () => {
  it("removes the date prefix and normalizes spacing", () => {
    expect(normalizeSessionLabel(" 11/04 - Sessão 2 ")).toBe("sessão 2");
  });
});

describe("buildSessionCopyMap", () => {
  it("maps sessions by sort order when labels include different dates", () => {
    const sourceSessions = [
      { id: "source-1", label: "10/04 - Sessão 1", start_time: "15:00:00", sort_order: 1 },
      { id: "source-2", label: "10/04 - Sessão 2", start_time: "18:00:00", sort_order: 2 },
    ];

    const targetSessions = [
      { id: "target-1", label: "11/04 - Sessão 1", start_time: "15:00:00", sort_order: 1 },
      { id: "target-2", label: "11/04 - Sessão 2", start_time: "18:00:00", sort_order: 2 },
    ];

    const sessionMap = buildSessionCopyMap(sourceSessions, targetSessions);

    expect(sessionMap.get("source-1")).toBe("target-1");
    expect(sessionMap.get("source-2")).toBe("target-2");
  });

  it("does not reuse the same target session twice", () => {
    const sourceSessions = [
      { id: "source-1", label: "Sessão 1", start_time: "15:00:00", sort_order: 1 },
      { id: "source-2", label: "Sessão 2", start_time: "15:00:00", sort_order: 1 },
    ];

    const targetSessions = [{ id: "target-1", label: "Sessão 1", start_time: "15:00:00", sort_order: 1 }];

    const sessionMap = buildSessionCopyMap(sourceSessions, targetSessions);

    expect(sessionMap.get("source-1")).toBe("target-1");
    expect(sessionMap.has("source-2")).toBe(false);
  });
});