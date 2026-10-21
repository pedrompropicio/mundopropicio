import { afterEach, describe, expect, it, vi } from "vitest";
import { buildBatchReference, buildPain001, creationDateTime, formatLocalDate, resolveExecutionDate, timestampId } from "./pain001";

const input = {
  listId: "local-test", listTitle: "Teste local", debtorName: "Teste local",
  debtorIban: "", debtorBic: "TOTAPTPL", executionDate: "2026-10-20", rows: [],
};

afterEach(() => vi.useRealTimers());

describe("SEPA — Europe/Lisbon, independent of the browser", () => {
  it("at 22h in Brazil execution defaults to the next calendar day in Lisbon", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T22:00:30-03:00"));
    expect(resolveExecutionDate(null)).toBe("2026-10-21");
    expect(formatLocalDate(new Date(Date.now()))).toBe("2026-10-21");
  });

  it("never exports the requested 20/10 when Lisbon is already 21/10", () => {
    const result = buildPain001({ ...input, now: new Date("2026-10-20T22:00:30-03:00") });
    expect(result.xml).toContain("<ReqdExctnDt><Dt>2026-10-21</Dt></ReqdExctnDt>");
    expect(result.fileName).toBe("transferencias_teste-local_20261021.xml");
  });

  it("CreDtTm uses Lisbon's summer offset, not Brazil or UTC", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T22:00:30-03:00"));
    expect(creationDateTime()).toBe("2026-10-21T02:00:30");
    expect(buildPain001(input).xml).toContain("<CreDtTm>2026-10-21T02:00:30</CreDtTm>");
  });

  it("timestampId uses Lisbon date and time", () => {
    expect(timestampId(new Date("2026-10-20T22:00:30-03:00"))).toBe("20261021020030");
  });

  it("MsgId and batch reference use Lisbon send time, preserving the explicit list date", () => {
    const now = new Date("2026-10-20T22:00:30-03:00");
    const result = buildPain001({ ...input, listDate: "2026-10-20", now });
    expect(buildBatchReference("2026-10-20", now)).toBe("PAGAMENTOS-MP-20102026-21100200");
    expect(buildBatchReference(null, now)).toBe("PAGAMENTOS-MP-21102026-21100200");
    expect(result.msgId).toBe("PAGAMENTOS-MP-20102026-21100200");
    expect(result.xml).toContain("<MsgId>PAGAMENTOS-MP-20102026-21100200</MsgId>");
  });

  it("preserves a future requested business date", () => {
    expect(resolveExecutionDate("2026-10-23", new Date("2026-10-21T01:00:00Z"))).toBe("2026-10-23");
  });

  it("preserves the existing next-business-day rule across the DST weekend", () => {
    expect(resolveExecutionDate(null, new Date("2026-10-23T22:30:00Z"))).toBe("2026-10-23");
    expect(resolveExecutionDate(null, new Date("2026-10-23T23:30:00Z"))).toBe("2026-10-26");
  });

  it.each([
    ["2026-03-29T00:59:59Z", "2026-03-29T00:59:59", "20260329005959", "29030059"],
    ["2026-03-29T01:00:00Z", "2026-03-29T02:00:00", "20260329020000", "29030200"],
    ["2026-10-25T00:59:59Z", "2026-10-25T01:59:59", "20261025015959", "25100159"],
    ["2026-10-25T01:00:00Z", "2026-10-25T01:00:00", "20261025010000", "25100100"],
  ])("uses the actual Lisbon DST offset at %s", (iso, creation, stamp, sent) => {
    const now = new Date(iso);
    expect(creationDateTime(now)).toBe(creation);
    expect(timestampId(now)).toBe(stamp);
    expect(buildBatchReference("2026-10-20", now)).toBe(`PAGAMENTOS-MP-20102026-${sent}`);
  });
});