import { useCallback, useLayoutEffect, useMemo, useRef, useState, type Ref } from "react";

/**
 * Pilha única de camadas (overlays) — ver docs/ARCHITECTURE.md "Pilha de camadas".
 *
 * Regra: nenhum componente define z-index de overlay à mão.
 * - Camadas (Dialog, AlertDialog, Sheet, Drawer, overlays manuais `OverlayLayer`):
 *   ao montar no DOM recebem z acima da camada que já está aberta.
 * - Flutuantes (Popover, Select, DropdownMenu, Tooltip, HoverCard, ContextMenu,
 *   Command dentro de Popover): ao montar recebem z acima da camada do topo.
 * - Toasts: TOAST_Z (acima de todas as camadas). Painel do Manual: 10600 (acima de tudo).
 *
 * O z é escrito no nó do DOM quando ele monta (callback ref) — não no render —,
 * porque o React chama DialogContent/PopoverContent mesmo com o diálogo fechado.
 */
export const LAYER_BASE = 1000;
export const LAYER_STEP = 10;
export const FLOATING_OFFSET = 5;
export const TOAST_Z = 10500;
const LAYER_MAX = TOAST_Z - LAYER_STEP;

type Entry = { id: number; z: number };
const stack: Entry[] = [];
let nextId = 1;
if (import.meta.env?.DEV && typeof window !== "undefined") {
  (window as unknown as { __overlayLayers?: Entry[] }).__overlayLayers = stack;
}

export function topLayerZ(): number {
  return stack.length ? stack[stack.length - 1].z : LAYER_BASE - LAYER_STEP;
}

export function pushLayer(): Entry {
  const z = Math.min(topLayerZ() + LAYER_STEP, LAYER_MAX);
  const entry: Entry = { id: nextId++, z };
  stack.push(entry);
  return entry;
}

export function popLayer(id: number) {
  const i = stack.findIndex((e) => e.id === id);
  if (i >= 0) stack.splice(i, 1);
}

/** Só para testes. */
export function __resetLayers() {
  stack.length = 0;
}

/** Só para diagnóstico/testes. */
export function __layersSnapshot() {
  return stack.map((e) => ({ ...e }));
}

/**
 * Camada controlada por um `open` explícito (ex.: ecrã inteiro, painel lateral).
 * Devolve o z-index a aplicar enquanto `open`.
 */
export function useOverlayLayer(open = true): number {
  const [z, setZ] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const entry = pushLayer();
    setZ(entry.z);
    return () => {
      popLayer(entry.id);
      setZ(null);
    };
  }, [open]);
  return z ?? topLayerZ() + LAYER_STEP;
}

/**
 * Camada ligada aos nós do DOM (fundo + conteúdo). A camada entra na pilha quando
 * o primeiro nó monta e sai quando o último desmonta (inclui animação de saída).
 */
export function useLayerNodeRefs() {
  const state = useRef<{ entry: Entry | null; nodes: Record<string, HTMLElement | null> }>({
    entry: null,
    nodes: {},
  });
  return useMemo(() => {
    const make = (key: string) => (node: HTMLElement | null) => {
      const st = state.current;
      st.nodes[key] = node;
      if (node) {
        if (!st.entry) st.entry = pushLayer();
        node.style.zIndex = String(st.entry.z);
        return;
      }
      if (st.entry && !Object.values(st.nodes).some(Boolean)) {
        popLayer(st.entry.id);
        st.entry = null;
      }
    };
    return { overlayRef: make("overlay"), contentRef: make("content") };
  }, []);
}

/** Flutuante: ao montar fica acima da camada do topo. */
export function useFloatingNodeRef() {
  return useCallback((node: HTMLElement | null) => {
    if (node) node.style.zIndex = String(topLayerZ() + FLOATING_OFFSET);
  }, []);
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref && typeof ref === "object") (ref as { current: T | null }).current = value;
}

/** Junta refs num callback estável (não re-dispara a cada render). */
export function useComposedRefs<T>(...refs: (Ref<T> | undefined)[]) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback((node: T | null) => refs.forEach((r) => assignRef(r, node)), refs);
}
