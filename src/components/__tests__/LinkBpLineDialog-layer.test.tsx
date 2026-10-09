import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OverlayLayer } from "@/components/ui/overlay-layer";
import { __resetLayers } from "@/lib/overlay-layer";
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ hasPermission: () => false }) }));
import LinkBpLineDialog from "../LinkBpLineDialog";

describe("#249 Vincular ao BP above Editar Transação", () => {
  beforeEach(() => __resetLayers());
  it("mounts above the existing transaction overlay and receives focus", () => {
    render(<QueryClientProvider client={new QueryClient()}>
      <OverlayLayer data-testid="edit-transaction" className="fixed inset-0">
        <LinkBpLineDialog transaction={{ id: "transaction" }} pickOnly onPicked={() => {}}
          onClose={() => {}} onLinked={() => {}} />
      </OverlayLayer>
    </QueryClientProvider>);
    const dialog = screen.getByRole("dialog", { name: "Vincular ao BP" });
    expect(Number(dialog.style.zIndex)).toBeGreaterThan(Number(screen.getByTestId("edit-transaction").style.zIndex));
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
});