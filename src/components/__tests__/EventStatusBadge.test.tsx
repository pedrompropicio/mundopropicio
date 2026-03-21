import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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
