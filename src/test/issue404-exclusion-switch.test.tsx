import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { PartnerSettlementExclusionSwitch } from "@/components/PartnerSettlementExclusionSwitch";

afterEach(cleanup);
describe("#404 (f): acesso e estados do interruptor", () => {
  it("não disponibiliza a marca a quem não pode gerir", () => {
    render(<PartnerSettlementExclusionSwitch row={{ type: "income" }} canManage={false} checked={false} onChange={vi.fn()} />);
    expect(screen.queryByRole("switch")).toBeNull();
  });
  it("não disponibiliza a marca em despesas", () => {
    render(<PartnerSettlementExclusionSwitch row={{ type: "expense" }} canManage checked={false} onChange={vi.fn()} />);
    expect(screen.queryByRole("switch")).toBeNull();
  });
  it.each(["is_transitory", "exclude_from_result", "event_settlement_id", "is_overhead"])("bloqueia incompatibilidade %s", flag => {
    render(<PartnerSettlementExclusionSwitch row={{ type: "income", [flag]: true }} canManage checked onChange={vi.fn()} />);
    expect(screen.getByRole("switch")).toBeDisabled();
    expect(screen.getByRole("switch")).not.toBeChecked();
  });
});