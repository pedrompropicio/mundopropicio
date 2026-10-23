import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { render } from "@testing-library/react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const css = readFileSync("src/index.css", "utf8").replace(/\s+/g, " ");
const rule = (sel: string) => {
  const re = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + " \\{([^}]*)\\}", "g");
  return [...css.matchAll(re)].map((m) => m[1]).join(" ");
};

describe("#340 modais em iPhone standalone", () => {
  it("overlay manual soma a safe-area ao respiro e não deixa o modal subir acima", () => {
    const r = rule(".modal-safe-overlay");
    expect(r).toContain("padding-top: calc(env(safe-area-inset-top, 0px) + 1rem)");
    expect(r).toContain("align-items: safe center");
  });
  it("shell manual limitado à caixa do overlay (100%), não só a 100vh/100dvh", () => {
    const r = rule(".manual-modal-shell");
    expect(r).toContain("100%)");
    expect(r).not.toMatch(/calc\(100d?vh/);
  });
  it("Dialog base desloca o centro pela safe-area em telemóvel", () => {
    expect(rule(".mobile-dialog-content")).toContain(
      "top: calc(50% + (env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) / 2)",
    );
  });
  it("X do Dialog base mantém área 44x44 e todos usam a classe partilhada", () => {
    expect(rule(".mobile-dialog-close")).toContain("width: 44px; height: 44px");
    render(
      <Dialog open>
        <DialogContent>
          <DialogHeader><DialogTitle>T</DialogTitle></DialogHeader>
        </DialogContent>
      </Dialog>,
    );
    expect(document.querySelector(".mobile-dialog-content")).not.toBeNull();
    expect(document.querySelector(".mobile-dialog-close")).not.toBeNull();
  });
});
