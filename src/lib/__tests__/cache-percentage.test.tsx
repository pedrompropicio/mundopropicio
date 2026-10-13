import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CachePercentageField from "@/components/CachePercentageField";
import { parseAdjustedInput, parseCachePercentage, canEditCachePercentage } from "@/lib/cache-percentage";
import { computeFinalAmount } from "@/lib/cache-calculations";

describe("percentagem do artista", () => {
  it("editar grava ao sair do campo (não a cada tecla) e recalcula", () => {
    const onSave = vi.fn();
    render(<CachePercentageField value={0} canEdit isFinalized={false} onSave={onSave} onInvalid={vi.fn()} />);
    const input = screen.getByLabelText(/Percentagem do artista/);
    fireEvent.change(input, { target: { value: "4" } });
    fireEvent.change(input, { target: { value: "40" } });
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(40);
    // recálculo: 40% de 10.000 com mínimo 1.000 → 4.000
    expect(computeFinalAmount({ percentage: 40, minimum_guaranteed: 1000 } as any, 10000)).toBe(4000);
    expect(computeFinalAmount({ percentage: 0, minimum_guaranteed: 1000 } as any, 10000)).toBe(1000);
  });

  it("Enter grava; fora de 0–100 recusa", () => {
    const onSave = vi.fn();
    const onInvalid = vi.fn();
    render(<CachePercentageField value={10} canEdit isFinalized={false} onSave={onSave} onInvalid={onInvalid} />);
    const input = screen.getByLabelText(/Percentagem do artista/);
    fireEvent.change(input, { target: { value: "120" } });
    fireEvent.blur(input);
    expect(onSave).not.toHaveBeenCalled();
    expect(onInvalid).toHaveBeenCalled();
    expect(parseCachePercentage("-1").ok).toBe(false);
    expect(parseCachePercentage("40")).toEqual({ ok: true, value: 40 });
  });

  it("finalizada não deixa editar", () => {
    render(<CachePercentageField value={40} canEdit isFinalized onSave={vi.fn()} onInvalid={vi.fn()} />);
    expect(screen.getByLabelText(/Percentagem do artista/)).toBeDisabled();
    expect(canEditCachePercentage(true, true)).toBe(false);
    expect(canEditCachePercentage(false, false)).toBe(false);
  });
});

describe("campo Ajustado", () => {
  it("vazio grava NULL; 0 escrito é ajuste real; inválido não grava", () => {
    expect(parseAdjustedInput("")).toBeNull();
    expect(parseAdjustedInput("   ")).toBeNull();
    expect(parseAdjustedInput("0")).toBe(0);
    expect(parseAdjustedInput("-5")).toBeUndefined();
  });
});
