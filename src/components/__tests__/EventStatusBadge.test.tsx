import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { EventStatusBadge } from "../EventStatusBadge";

vi.mock("@/lib/mock-data", () => ({
  statusLabels: {
    planning: "Planeamento",
    confirmed: "Confirmado",
    active: "Ativo",
    completed: "Concluído",
    cancelled: "Cancelado",
  },
}));

describe("EventStatusBadge", () => {
  it.each([
    ["planning", "Planeamento"],
    ["confirmed", "Confirmado"],
    ["active", "Ativo"],
    ["completed", "Concluído"],
    ["cancelled", "Cancelado"],
  ] as const)("renders %s status", (status, label) => {
    const { getByText } = render(<EventStatusBadge status={status as any} />);
    expect(getByText(label)).toBeInTheDocument();
  });
});
