import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { StatCard } from "../StatCard";
import { DollarSign } from "lucide-react";

describe("StatCard", () => {
  it("renders title and value", () => {
    const { getByText } = render(<StatCard title="Receita" value="€10.000" icon={DollarSign} />);
    expect(getByText("Receita")).toBeInTheDocument();
    expect(getByText("€10.000")).toBeInTheDocument();
  });

  it("renders subtitle when provided", () => {
    const { getByText } = render(<StatCard title="T" value="V" icon={DollarSign} subtitle="Este mês" />);
    expect(getByText("Este mês")).toBeInTheDocument();
  });

  it("renders positive trend", () => {
    const { container } = render(<StatCard title="T" value="V" icon={DollarSign} trend={{ value: "+12%", positive: true }} />);
    expect(container.textContent).toContain("↑");
    expect(container.textContent).toContain("+12%");
  });

  it("renders negative trend", () => {
    const { container } = render(<StatCard title="T" value="V" icon={DollarSign} trend={{ value: "-5%", positive: false }} />);
    expect(container.textContent).toContain("↓");
    expect(container.textContent).toContain("-5%");
  });
});
