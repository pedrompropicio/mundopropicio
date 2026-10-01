---
name: Pilha de overlays (z-index)
description: Nenhum componente define z-index de overlay à mão; Dialog/AlertDialog/Sheet/Drawer/OverlayLayer e flutuantes usam a pilha de src/lib/overlay-layer.ts
type: constraint
---
- Regra: nunca pôr z-[..]/z-50 em DialogContent, SelectContent, PopoverContent, overlays `fixed inset-0`, overlayClassName/contentClassName.
- Overlay manual novo = `<OverlayLayer>` (porta para document.body; evita também o bug `.glass` + backdrop-filter).
- Camadas: base 1000, +10 por camada aberta; flutuantes topo+5; toasts 10500; Manual 10600.
- Porquê: 01/10/2026 Dialog z-50 aberto dentro de overlays z-[100]/z-[200] ficava atrás (camarim Ivete; Nova Transação da Délia).
- z escrito no nó do DOM ao montar (callback ref), nunca no render (DialogContent renderiza mesmo fechado → camadas penduradas).
