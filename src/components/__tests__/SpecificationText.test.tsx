import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SpecificationText } from "../SpecificationText";

const LONG = "Linha 1\nLinha 2\nLinha 3\nLinha 4";

describe("SpecificationText (Issue #343)", () => {
  it("recolhida por omissão a 2 linhas e alterna ao clicar", () => {
    render(<SpecificationText text={LONG} />);
    const el = screen.getByRole("button");
    expect(el.className).toContain("line-clamp-2");
    fireEvent.click(el);
    expect(el.className).not.toContain("line-clamp-2");
    expect(el.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(el);
    expect(el.className).toContain("line-clamp-2");
  });

  it("clique não chega ao clique da linha", () => {
    const onRow = vi.fn();
    render(<div onClick={onRow}><SpecificationText text={LONG} /></div>);
    fireEvent.click(screen.getByRole("button"));
    expect(onRow).not.toHaveBeenCalled();
  });

  it("texto curto fica simples, sem botão", () => {
    render(<SpecificationText text="curta" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("curta")).toBeTruthy();
  });
});
