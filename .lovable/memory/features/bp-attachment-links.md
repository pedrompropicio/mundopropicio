---
name: BP attachment links
description: Importação e propagação de links externos (Drive/Dropbox) das colunas G–K do BP, com matching multi-camada (líquido OR bruto OR só descrição no Master) e botão "Reprocessar" que re-tenta órfãos pendentes
type: feature
---

# Links de anexos do BP

Links externos (Google Drive, Dropbox, etc.) que aparecem nas colunas G–K do XLSX de BP são propagados para `event_forecasts.attachment_refs` e — quando já existe transação — também para `transaction_documents` com prefixo `ref://http(s)://`. Renderizam como anexos clicáveis com hover-thumbnail (Drive) via `ExternalLinkAttachment.tsx`.

## Motor de matching (`findForecastMatch` em `src/lib/import-pl-xlsx.ts`)

Pipeline em 3 camadas, parando na primeira que encontra:

1. **Primary pool** (sub-evento) — descrição normalizada igual **E** valor bate em líquido OU bruto (`amount` OU `amount * (1 + iva_rate/100)`) com tolerância de 0,01€.
2. **Master pool** — mesma regra (descrição + líquido OU bruto).
3. **Master pool** — apenas descrição normalizada (último recurso). Cobre casos em que o Master agrega valores que diferem dos sub-eventos (ex: cachê total ≠ cachê por cidade).

A tolerância dual líquido/bruto é fundamental porque o XLSX de BP pode trazer na coluna F tanto valor com IVA como sem IVA dependendo de quem preencheu. O fallback de descrição pura só dispara para o Master para evitar falsos positivos entre sub-eventos com nomes repetidos.

## Órfãos e reprocessamento

Quando nenhuma das 3 camadas bate, o link cai em `bp_orphan_attachments` (status `pending`), ancorado ao primeiro `eventId` da importação.

A UI do BP mostra dois botões quando há órfãos:
- **"Anexos pendentes (N)"** → abre `OrphanAttachmentsResolver` para resolução manual (sugestões por similaridade de tokens + valor).
- **"Reprocessar"** → invoca `reprocessOrphanAttachments(anchorEventId, childEventIds, parentEventId, user)`, que re-aplica `findForecastMatch` aos órfãos pendentes, vinculando os que agora batem (à medida que o Master é criado/promovido depois da primeira importação) e mantendo como `pending` os que continuam sem match. Útil quando o motor é melhorado ou quando linhas Master surgem após a importação inicial.
