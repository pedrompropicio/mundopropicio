
## Regras e fluxos atuais das fases (correção)

A **fase é do evento**, não da etapa. O evento percorre 4 estados em `events.operacao_mode`:

```
SETUP → PLANEAMENTO → MONTAGEM → EVENTO
```

- Transição é **manual** (botão no header do EventHub), com confirmação para Montagem/Evento.
- Cada fase tem uma vista própria; só **PLANEAMENTO** já lista frentes+etapas. Setup serve para criar zonas/serviços.
- Não há bloqueios automáticos entre fases. Etapas (`operacao_etapas`) têm apenas `status` (pending, in_progress, blocked, done, cancelled) e datas (`planned_start`, `planned_end`).
- "Filtrar por fase" no PDF será portanto **heurístico por data**, relativo às datas do evento:
  - **Setup** — etapas sem data ou >14 dias antes do evento
  - **Planeamento** — entre 14 e 2 dias antes
  - **Montagem** — 1 dia antes até abertura
  - **Evento** — entre `event.start_date` e `end_date`

## Nova feature: PDF "Relatório Operacional"

### Acesso
- Botão **"Exportar PDF"** no header da fase **Planeamento** (e replicado em Montagem/Evento) dentro do EventHub.
- Abre um diálogo `OperationalReportDialog` com as opções.

### Opções no diálogo
1. **Fases** (multi-checkbox) — Setup / Planeamento / Montagem / Evento. Default: todas marcadas.
2. **Status a incluir** (multi-checkbox) — Pendente / Em curso / Bloqueada / Concluída / Cancelada. Default: tudo exceto Cancelada.
3. **Nível de detalhe** (radio):
   - **Compacto** — 1 linha por etapa (nome · status · datas · responsável).
   - **Médio** — + descrição/escopo, fornecedor vinculado, lista de assignees.
   - **Completo** — + registos (notas e fotos) cronológicos com observação por registo.
4. **Incluir registos fotográficos** (switch, só ativo nos modos Médio/Completo) — embute fotos em miniatura (`max 600px`) abaixo de cada etapa, com a observação do registo.

### Layout do PDF
- **Capa**: nome do evento + cidade + datas + logo da empresa + data/hora de geração + filtros aplicados.
- **Sumário executivo** (1 página): contadores por status × fase, total de etapas, % concluído.
- **Conteúdo agrupado**:
  ```
  ┌─ FASE PLANEAMENTO ──────────────────────
  │  ▌Zonas Físicas
  │    ├─ Palco Principal (José Lombello)
  │    │    • Etapa 1  [Em curso]  10–12 Mai
  │    │    • Etapa 2  [Concluída] 08 Mai
  │    └─ Catering (Leonardo Santos)
  │
  │  ▌Serviços Transversais
  │    └─ Cerimónia (Ricardo Miranda)
  └─ FASE MONTAGEM ──────────────────────
  ```
- Cada fase numa nova página. Dentro da fase: secção "Zonas Físicas" → secção "Serviços Transversais" (mesma ordem do PlanejamentoPhase).
- Etapas sem frente (orfãs) numa secção "Outras" no fim de cada fase.

### Backend
- Sem migração necessária. Tudo lido a partir de tabelas existentes: `events`, `operacao_frentes`, `operacao_etapas`, `operacao_etapa_assignees`, `operacao_registos` (se modo Completo), `profiles`, `suppliers`.
- Geração no cliente com **pdf-lib** + `@react-pdf/renderer` (já temos `pdf-lib` no projeto para outros relatórios — confirmar e reutilizar).

### Detalhes técnicos
- **Heurística de fase por etapa**:
  ```ts
  function inferEtapaPhase(etapa, event): Phase {
    if (!etapa.planned_start) return "setup";
    const daysBefore = differenceInDays(event.start_date, etapa.planned_start);
    if (etapa.planned_start >= event.start_date && etapa.planned_start <= event.end_date) return "evento";
    if (daysBefore <= 1) return "montagem";
    if (daysBefore <= 14) return "planning";
    return "setup";
  }
  ```
- **Fotos**: ler de `operacao_registos.media_urls` (Signed URLs 1h), reduzir client-side com Canvas antes de embutir.
- **Ordem dentro de cada frente**: por `display_order`, depois `planned_start`.

### Ficheiros a criar / editar
- `src/components/operacao/reports/OperationalReportDialog.tsx` (novo) — diálogo de opções.
- `src/components/operacao/reports/operationalReportPdf.tsx` (novo) — componente `<Document>` do `@react-pdf/renderer`.
- `src/lib/operacao/inferEtapaPhase.ts` (novo) — heurística.
- `src/pages/operacao/EventHub.tsx` — adicionar botão "Exportar PDF".
- `src/components/operacao/event/PlanejamentoPhase.tsx` — opcional: botão atalho no topo.

### O que fica de fora desta entrega
- Não introduz controlos/bloqueios entre fases (mantém transição manual atual).
- Não cria coluna `fase` nas etapas — se mais tarde quisermos atribuir fase explícita por etapa (e não inferir por data), isso será uma feature separada com migração.

