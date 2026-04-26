# Spec: Sistema de Versões do Business Plan (BP)

> Documento consolidado das decisões tomadas. A implementação seguirá esta spec.
> Última atualização: 2026-04-26

---

## 1. Modelo geral

**Edições no BP são imediatas** (como hoje). O sistema de versões funciona em paralelo:
- BP "ao vivo" = working copy editável continuamente
- **Versões** = snapshots imutáveis criados manualmente pelo admin ("congelar versão")
- A "**versão ativa**" é a referência oficial para sócios e relatórios versionados

Não há modelo Git de commit obrigatório. Versões são marcos voluntários.

---

## 2. Ciclo de vida de uma versão

### 2.1 Criação
- Admin clica **"Congelar nova versão"** no card do BP
- Pode escolher: criar como **rascunho** (não-publicada) ou **aprovar imediatamente** (vira versão ativa)
- Sistema captura snapshot completo: todas as linhas BP do evento (ou Master + Splits — ver §6) com:
  - Valores, IVA, categorias, descrições
  - **Status de cada linha no momento** (draft/approved/etc.)
  - Anexos referenciados
- Pede ao admin uma **descrição/changelog** opcional ("v3 — ajuste após reunião com cliente")

### 2.2 Aprovação
- **Aprovar = ativar** = sincronizar
- v3 vira a nova versão ativa
- v2 (anterior ativa) muda automaticamente para estado **"substituída"** no histórico
- Audit log regista a transição com timestamp e autor

### 2.3 Eliminação
- Versões aprovadas são **imutáveis** — nunca podem ser apagadas
- Admin pode **arquivar** versões antigas → escondem-se da timeline mas permanecem na DB
- Botão **"Mostrar arquivadas"** revela-as quando preciso
- Rascunhos podem ser descartados livremente

---

## 3. Concorrência e edição

- **Sem lock pessimista** — múltiplos admins editam o BP em simultâneo (como hoje)
- Audit log já regista quem mudou o quê
- Apenas a ação **"congelar versão"** é atómica (transação única — primeiro admin vence se houver corrida)

---

## 4. Reverter / descartar mudanças

- Botão destrutivo **"Reverter BP para versão ativa (vX)"** disponível no card do BP
- Apaga todas as edições feitas no BP ao vivo desde o último congelamento
- Reescreve o BP ao vivo com snapshot da versão ativa
- Confirmação dupla obrigatória (ação destrutiva)
- Audit log regista como "reset para vX por [user] em [timestamp]"

---

## 5. Indicadores visuais no BP ao vivo

### Card no topo do BP (sempre visível quando há versão ativa)
Glassmorphism, mostra:
- Versão ativa (ex: **v3 — aprovada 12/abr por Diogo**)
- Métricas desde v3:
  - **N edições** (contagem)
  - **Δ €+3.450** (delta total vs versão ativa)
- Botões de ação:
  - **Congelar nova versão**
  - **Reverter para v3** (destrutivo)
  - **Ver histórico**
  - **Comparar versões**

---

## 6. Master/Split (turnês)

- **Versionamento cascateia do Master**: congelar v3 no Master cria automaticamente snapshot equivalente em **todos os Splits**
- Mesmo número de versão, mesmo timestamp para a turnê inteira
- Histórico sincronizado — não há versionamento independente por Split
- Reverter para vX no Master também reverte os Splits
- Visualmente os Splits mostram "v3 (do Master)" no card

---

## 7. Geração de transações a partir do BP

- Admin **escolhe a fonte** ao gerar transações em lote:
  - **Opção A**: gerar a partir da versão ativa (vX) — usa snapshot
  - **Opção B**: gerar a partir do BP ao vivo — usa estado atual
- Default sugerido: versão ativa (mais previsível)
- Geração individual (um botão na linha do BP) usa sempre o BP ao vivo

---

## 8. Visibilidade no Portal do Sócio

- Sócios veem apenas a **versão ativa atual**
- Sem dropdown de versões anteriores
- Sem comparação
- Sem rascunhos
- Label discreto: "Business Plan — versão v3 (12/abr/2026)"

---

## 9. Comparação entre versões (admin)

- Acessível pelo botão "Comparar versões" no card
- Dois dropdowns para escolher **qualquer combinação A vs B** (não precisa ser sequencial)
- Toggle: **2 colunas lado-a-lado** (default à escolha do utilizador, persistido)
- Tabela hierárquica colapsável: Grupo L1 → Categoria L2 → linhas
- Cores semânticas:
  - **Verde**: linha adicionada
  - **Amarelo**: linha modificada (mostra delta)
  - **Cinzento riscado**: linha zerada/removida
- Stat cards no topo: total Δ, nº linhas alteradas, % variação
- Footer: botão "Exportar PDF da comparação"

---

## 10. PDF de comparação de versões

- Cabeçalho: logo MP, nome do evento, "Comparação BP: vA vs vB", datas
- Tabela hierárquica (mesma da UI, sem cores interativas mas com ícones ▲▼)
- Footer: gerado em [data], assinaturas opcionais

---

## 11. Tratamento de transações "Fora do BP" entre versões

### O que é "Fora do BP" (recap)
Transação lançada via **bypass** porque excedia a verba da categoria. Tem `pl_override_note` (justificativa do admin) e badge laranja.

### 11.1 Aumento de verba (v2 cria espaço)
- **Auto-reconciliar** ao aprovar nova versão
- Se a transação cabe agora no novo saldo da categoria → remove flag "Fora do BP" automaticamente
- Audit log regista: "reconciliada automaticamente em v2"
- **Justificativa original mantém-se visível como histórico permanente**:
  - Texto fica na transação com nota: *"Bypass original (reconciliado em v2 a 15/abr): [texto original]"*
  - Sem badge laranja, mas justificativa nunca se perde

### 11.2 Redução de verba (v2 reduz e transações deixam de caber)
- Permitir a redução
- Sistema marca transações que passam a estar acima do novo limite com flag **"Fora do BP retroativo"**
- Visível a vermelho no relatório BP x Transações
- Mostra na tooltip: "Lançada quando havia €X, reduzido para €Y em vN"

---

## 12. Histórico de alterações (audit log)

- Cada **linha do BP** mantém o seu audit log atual (histórico de edições)
- Acessível no card da linha (chevron expande para mostrar log)
- Versões guardam **snapshot estático** das linhas — não duplicam o audit log
- Justificativa de edição: **opcional** quando há sistema de versões ativo (era obrigatória antes; agora flexível)

---

## 13. Versões e outros eventos

- Versões são **estritamente locais ao evento** (ou turnê via Master)
- Não há acesso a versões de outros eventos
- Não há "templates de versões" ou cópia entre eventos

---

## 14. Estados de uma versão

| Estado | Descrição |
|---|---|
| `draft` | Rascunho criado mas não ativo. Admin pode editar metadados e descartar. |
| `active` | Versão ativa — referência oficial para sócios e relatórios versionados. |
| `superseded` | Substituída por uma nova versão ativa. Continua acessível no histórico. |
| `archived` | Arquivada manualmente — escondida da timeline mas presente na DB. |

---

## 15. Modelo de dados (alto nível)

### Nova tabela: `bp_versions`
- `id` UUID
- `event_id` UUID (FK events) — Master ou standalone
- `version_number` int (sequencial por evento)
- `state` text (`draft` | `active` | `superseded` | `archived`)
- `created_by` UUID
- `created_at` timestamp
- `approved_at` timestamp (nullable)
- `description` text (changelog)
- `snapshot_payload` jsonb — cópia completa de todas as linhas BP no momento
- `cascaded_from_version_id` UUID (nullable) — para Splits que herdam do Master

### Nova tabela: `bp_version_audit_log`
- transições de estado, reconciliações automáticas, etc.

### Alterações em tabelas existentes
- `event_forecasts`: novo campo `historic_overrides` jsonb (array de bypasses anteriores reconciliados)
- `event_forecasts`: novo campo `is_retroactive_override` bool (flag "Fora do BP retroativo")

---

## 16. Mocks visuais aprovados

- **Card no topo**: glassmorphism com versão ativa, deltas e ações
- **Comparação**: dropdowns + stat cards + tabela hierárquica colapsável com cores
- **Timeline**: cards verticais com badges (ACTIVE / SUPERSEDED / ARCHIVED)

(Ficheiros em `/mnt/documents/mock-bp-versions-1-card.png`, `mock-bp-versions-2-compare.png`, `mock-bp-versions-3-history.png`)

---

## 17. Fora do escopo desta primeira versão

- Branching de versões (ex: v3a vs v3b paralelas)
- Merge de rascunhos por utilizador
- Templates de versão entre eventos
- Lock pessimista (decidido: sem lock)
- Rascunhos pessoais por utilizador (decidido: edições são imediatas e partilhadas)

---

## 18. Ordem sugerida de implementação

1. **Fase 1 — Schema**: criar `bp_versions`, `bp_version_audit_log`, novos campos em `event_forecasts`
2. **Fase 2 — Backend de snapshots**: função para criar snapshot completo de um evento (incl. cascade Master→Splits)
3. **Fase 3 — UI base**: card no topo do BP com versão ativa + botão "Congelar"
4. **Fase 4 — Timeline e histórico**: página/modal de versões com cards e arquivamento
5. **Fase 5 — Comparação**: vista lado-a-lado + cores + PDF
6. **Fase 6 — Reconciliação automática**: lógica de auto-reconciliar ao aprovar versão
7. **Fase 7 — Reverter/descartar**: botão destrutivo com confirmação
8. **Fase 8 — Geração de transações**: escolha da fonte (versão ativa vs BP ao vivo)
9. **Fase 9 — Portal do Sócio**: label discreto da versão ativa
10. **Fase 10 — Polish e testes**: cenários canónicos, audit, edge cases
