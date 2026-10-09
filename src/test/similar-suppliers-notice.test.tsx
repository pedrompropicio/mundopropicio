import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SimilarSuppliersNotice, isNifBlocked, type SimilarSupplier } from "@/components/SimilarSuppliersNotice";

const base = { nif: "123456789", iban: null, iban_2: null, iban_3: null };
const active: SimilarSupplier = { ...base, id: "a", name: "Pixel Light", is_active: true, motivo: "nif" };
const inactive: SimilarSupplier = { ...base, id: "b", name: "Pixel Light Lda", is_active: false, motivo: "nome" };

describe("SimilarSuppliersNotice", () => {
  it("NIF igual a ativo esconde 'criar mesmo assim'", () => {
    render(<SimilarSuppliersNotice list={[active]} typedNif="PT123456789" canManage onUse={vi.fn()} onCreateAnyway={vi.fn()} />);
    expect(screen.queryByText(/criar mesmo assim/)).toBeNull();
    expect(screen.getByText("Usar «Pixel Light»")).toBeTruthy();
  });

  it("só nome parecido deixa criar e chama os callbacks", () => {
    const onUse = vi.fn(); const onCreate = vi.fn();
    render(<SimilarSuppliersNotice list={[inactive]} canManage onUse={onUse} onCreateAnyway={onCreate} />);
    fireEvent.click(screen.getByText("Reativar e usar «Pixel Light Lda»"));
    fireEvent.click(screen.getByText(/criar mesmo assim/));
    expect(onUse).toHaveBeenCalledWith(inactive);
    expect(onCreate).toHaveBeenCalled();
  });

  it("inativo sem permissão pede a um admin", () => {
    render(<SimilarSuppliersNotice list={[inactive]} canManage={false} onUse={vi.fn()} onCreateAnyway={vi.fn()} />);
    expect(screen.getByText(/Pede a um admin\/manager/)).toBeTruthy();
  });

  it("isNifBlocked ignora NIF vazio", () => {
    expect(isNifBlocked("", [active])).toBe(false);
    expect(isNifBlocked("123456789", [inactive])).toBe(false);
  });
});
