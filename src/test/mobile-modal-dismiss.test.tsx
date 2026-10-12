import { useState } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { OverlayLayer } from "@/components/ui/overlay-layer";
import { useModalDismiss } from "@/hooks/useModalDismiss";
import { DiscardModalChangesDialog } from "@/components/DiscardModalChangesDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

afterEach(cleanup);
function Example({ onClose, nested = false }: { onClose: () => void; nested?: boolean }) {
  const [dirty, setDirty] = useState(false);
  const dismiss = useModalDismiss(dirty, onClose);
  return <OverlayLayer ref={dismiss.overlayRef} {...dismiss.backdrop} data-testid="backdrop">
    <input aria-label="Descrição" onChange={() => setDirty(true)} />
    <button onClick={dismiss.requestClose}>Fechar</button>
    <DiscardModalChangesDialog open={dismiss.confirmDiscard} onOpenChange={dismiss.setConfirmDiscard} onDiscard={onClose} />
    {nested && <Dialog open><DialogContent><DialogHeader><DialogTitle>Outra janela</DialogTitle></DialogHeader></DialogContent></Dialog>}
  </OverlayLayer>;
}
describe("Fecho de modais no telemóvel", () => {
  it("fecha pelo fundo sem alterações", () => {
    const close = vi.fn(); render(<Example onClose={close} />);
    const backdrop = screen.getByTestId("backdrop");
    fireEvent.pointerDown(backdrop); fireEvent.click(backdrop);
    expect(close).toHaveBeenCalledOnce();
  });
  it("não fecha quando o pointerdown começou no formulário", () => {
    const close = vi.fn(); render(<Example onClose={close} />);
    fireEvent.pointerDown(screen.getByLabelText("Descrição")); fireEvent.click(screen.getByTestId("backdrop"));
    expect(close).not.toHaveBeenCalled();
  });
  it("Esc fecha sem alterações", () => {
    const close = vi.fn(); render(<Example onClose={close} />);
    fireEvent.keyDown(document, { key: "Escape" }); expect(close).toHaveBeenCalledOnce();
  });
  it("X pede confirmação e permite continuar ou descartar", () => {
    const close = vi.fn(); render(<Example onClose={close} />);
    fireEvent.change(screen.getByLabelText("Descrição"), { target: { value: "alterado" } });
    fireEvent.click(screen.getByText("Fechar")); expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Continuar a editar")); expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Fechar")); fireEvent.click(screen.getByText("Descartar e fechar"));
    expect(close).toHaveBeenCalledOnce();
  });
  it("Esc não fecha o modal sob outra janela", () => {
    const close = vi.fn(); render(<Example onClose={close} nested />);
    fireEvent.keyDown(document, { key: "Escape" }); expect(close).not.toHaveBeenCalled();
  });
  it("Dialog separa cabeçalho e corpo e mantém o X fora do scroll", () => {
    render(<Dialog open><DialogContent><DialogHeader><DialogTitle>Título fixo</DialogTitle></DialogHeader><p>Corpo</p></DialogContent></Dialog>);
    expect(screen.getByText("Título fixo").closest(".dialog-fixed-header")).toBeTruthy();
    expect(screen.getByText("Corpo").closest(".dialog-scroll-body")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close" }).closest(".dialog-scroll-body")).toBeNull();
  });
});