import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { screen } from "@testing-library/dom";
import { EventStatusBadge } from "../EventStatusBadge";

// We need to mock the statusLabels import
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
    render(<EventStatusBadge status={status as any} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
