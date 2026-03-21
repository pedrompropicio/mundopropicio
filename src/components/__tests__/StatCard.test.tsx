import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { screen } from "@testing-library/dom";
import { StatCard } from "../StatCard";
import { DollarSign } from "lucide-react";

describe("StatCard", () => {
  it("renders title and value", () => {
    render(<StatCard title="Receita" value="€10.000" icon={DollarSign} />);
    expect(screen.getByText("Receita")).toBeInTheDocument();
    expect(screen.getByText("€10.000")).toBeInTheDocument();
  });

  it("renders subtitle when provided", () => {
    render(<StatCard title="T" value="V" icon={DollarSign} subtitle="Este mês" />);
    expect(screen.getByText("Este mês")).toBeInTheDocument();
  });

  it("renders trend with correct direction", () => {
    render(<StatCard title="T" value="V" icon={DollarSign} trend={{ value: "+12%", positive: true }} />);
    expect(screen.getByText(/↑.*\+12%/)).toBeInTheDocument();
  });

  it("renders negative trend", () => {
    render(<StatCard title="T" value="V" icon={DollarSign} trend={{ value: "-5%", positive: false }} />);
    expect(screen.getByText(/↓.*-5%/)).toBeInTheDocument();
  });
});
