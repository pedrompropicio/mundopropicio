import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  pushLayer,
  popLayer,
  topLayerZ,
  __resetLayers,
  __layersSnapshot,
  LAYER_BASE,
  LAYER_STEP,
  FLOATING_OFFSET,
} from "@/lib/overlay-layer";
import { OverlayLayer } from "@/components/ui/overlay-layer";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const z = (el: Element | null) => Number((el as HTMLElement | null)?.style.zIndex || 0);

describe("pilha de camadas — núcleo", () => {
  beforeEach(() => __resetLayers());

  it("cada camada nova fica acima da anterior; fechar devolve o topo", () => {
    const a = pushLayer();
    const b = pushLayer();
    expect(a.z).toBe(LAYER_BASE);
    expect(b.z).toBe(LAYER_BASE + LAYER_STEP);
    expect(topLayerZ() + FLOATING_OFFSET).toBeGreaterThan(b.z);
    popLayer(b.id);
    expect(topLayerZ()).toBe(a.z);
  });
});

describe("pilha de camadas — aninhamentos reais", () => {
  beforeEach(() => __resetLayers());

  it("Dialog fechado não ocupa camada", () => {
    render(
      <Dialog open={false}>
        <DialogContent>
          <DialogTitle>x</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    expect(__layersSnapshot()).toHaveLength(0);
  });

  it("Dialog dentro de overlay manual fica por cima", () => {
    render(
      <OverlayLayer data-testid="manual" className="fixed inset-0">
        <Dialog open>
          <DialogContent data-testid="dlg">
            <DialogTitle>Novo fornecedor</DialogTitle>
          </DialogContent>
        </Dialog>
      </OverlayLayer>,
    );
    expect(z(screen.getByTestId("dlg"))).toBeGreaterThan(z(screen.getByTestId("manual")));
  });

  it("AlertDialog dentro de Dialog fica por cima", () => {
    render(
      <Dialog open>
        <DialogContent data-testid="dlg">
          <DialogTitle>Base</DialogTitle>
          <AlertDialog open>
            <AlertDialogContent data-testid="alert">
              <AlertDialogTitle>Confirmar</AlertDialogTitle>
            </AlertDialogContent>
          </AlertDialog>
        </DialogContent>
      </Dialog>,
    );
    expect(z(screen.getByTestId("alert"))).toBeGreaterThan(z(screen.getByTestId("dlg")));
  });

  it("Select dentro de AlertDialog dentro de overlay manual fica por cima de tudo", () => {
    render(
      <OverlayLayer data-testid="manual" className="fixed inset-0">
        <AlertDialog open>
          <AlertDialogContent data-testid="alert">
            <AlertDialogTitle>Linha de BP</AlertDialogTitle>
            <Select open value="a">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent data-testid="sel">
                <SelectItem value="a">Linha A</SelectItem>
              </SelectContent>
            </Select>
          </AlertDialogContent>
        </AlertDialog>
      </OverlayLayer>,
    );
    const manual = z(screen.getByTestId("manual"));
    const alert = z(screen.getByTestId("alert"));
    const sel = z(screen.getByTestId("sel"));
    expect(alert).toBeGreaterThan(manual);
    expect(sel).toBeGreaterThan(alert);
  });
});
