# Spec: Sistema de Versões do Business Plan (BP)

> Documento consolidado das decisões tomadas. A implementação seguirá esta spec.
> Última atualização: 2026-09-06 (revisão 4 — 2026-09-06, working_draft documentado (D23))
> Histórico: revisão 3 — 2026-04-26, adicionado modelo de cenários múltiplos §26-28

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
- **v1 é criada automaticamente** quando o evento muda para estado "Confirmado" ou "Ativo" (ver §19 para migração de eventos existentes)
- A partir daí, admin clica **"Congelar nova versão"** no card do BP para criar v2, v3, etc.
- Pode escolher: criar como **rascunho** (não-publicada) ou **aprovar imediatamente** (vira versão ativa)
- Sistema captura snapshot completo: todas as linhas BP do evento (ou Master + Splits — ver §6) com:
  - Valores, IVA, categorias, descrições
  - **Status de cada linha no momento** (draft/approved/etc.)
  - **Anexos duplicados** para pasta de snapshot dedicada (ver §20)
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

### 2.4 Numeração
- **Sequencial simples**: v1, v2, v3, v4...
- Sem labels customizáveis, sem major.minor
- A descrição/changelog do admin (campo livre) acompanha cada versão

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

### 4.1 Bloqueio por transações ligadas
- **Sistema bloqueia revert se houver transações geradas/lançadas** a partir de linhas BP que foram editadas ou criadas após vX
- Mostra lista de transações conflituantes com link direto
- Admin tem que tratar primeiro (apagar transações ou mover para outra categoria) e depois reverter
- Garante consistência: nunca fica uma transação órfã a apontar para uma linha BP que foi revertida

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

### 6.1 Splits adicionados após uma versão congelada
- Quando admin adiciona um novo Split a uma turnê que já tem v3 congelada:
- Sistema cria automaticamente um **snapshot retroativo do Split** dentro de v3 (mesmo número de versão, marcado como "snapshot retroativo")
- Garante que a próxima comparação vN vs v3 inclui o Split novo de forma coerente
- Audit log regista: "Split X adicionado retroativamente à v3 em [timestamp]"

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
- `description` text (changelog livre)
- `snapshot_payload` jsonb — cópia completa de todas as linhas BP no momento
- `cascaded_from_version_id` UUID (nullable) — para Splits que herdam do Master
- `is_retroactive_snapshot` bool — true quando criada para Split adicionado depois (§6.1)

### Nova tabela: `bp_version_audit_log`
- transições de estado, reconciliações automáticas, etc.

### Alterações em tabelas existentes
- `event_forecasts`: novo campo `historic_overrides` jsonb (array de bypasses anteriores reconciliados)
- `event_forecasts`: novo campo `is_retroactive_override` bool (flag "Fora do BP retroativo")

### Storage
- **Novo bucket**: `bp-version-snapshots` (privado, signed URLs 1h, igual aos outros)
- Anexos de linhas BP são **duplicados** para esta pasta no momento de congelar versão
- Estrutura: `bp-version-snapshots/{event_id}/{version_id}/{original_filename}`

---

## 16. Mocks visuais aprovados

- **Card no topo**: glassmorphism com versão ativa, deltas e ações
- **Comparação**: dropdowns + stat cards + tabela hierárquica colapsável com cores
- **Timeline**: cards verticais com badges (ACTIVE / SUPERSEDED / ARCHIVED)

(Ficheiros em `/mnt/documents/mock-bp-versions-1-card.png`, `mock-bp-versions-2-compare.png`, `mock-bp-versions-3-history.png`)

---

## 17. Permissões por role

| Role | Criar versão | Aprovar | Reverter | Arquivar | Ver histórico/comparar | Card visível |
|---|---|---|---|---|---|---|
| **Admin** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Manager** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Editor** | ❌ | ❌ | ❌ | ❌ | ✅ (read-only) | ✅ |
| **Viewer** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Partner (Sócio)** | ❌ | ❌ | ❌ | ❌ | ❌ | só label v ativa |

---

## 18. Relatórios e versões

- **Relatórios usam sempre o BP ao vivo** (estado atual)
- Versões são apenas histórico paralelo — não há dropdown "BP base" em relatórios
- Comparação entre versões fica isolada na vista dedicada (§9)
- Mantém os relatórios simples e previsíveis

---

## 19. Eventos existentes (migração)

- Migração one-time cria automaticamente **v1** para todos os eventos com estado **"Em planeamento", "Confirmado" ou "Ativo"**
- Eventos com estado **"Concluído"** ficam sem versões (estado fechado)
- v1 = snapshot do BP no momento da migração
- `created_by` = `system`, `description` = "Versão inicial criada na migração do sistema de versões"

---

## 20. Anexos no snapshot

- Ao congelar uma versão, o sistema **duplica todos os anexos** referenciados pelas linhas BP para `bp-version-snapshots/{event_id}/{version_id}/`
- Garante integridade histórica: mesmo se admin apagar o anexo original mais tarde, a versão preserva a cópia
- Anexos do tipo "link externo" (Drive/Dropbox via `bp-attachment-links`) ficam apenas como referência — não há forma de duplicar
- Quando uma versão é arquivada, anexos ficam (não economiza storage)
- Quando uma versão entra em Trash (cascade do evento), anexos ficam até o evento ser hard-deleted após 30 dias

---

## 21. Notificações

- **Sem notificações automáticas** ao aprovar nova versão
- Quem quiser saber consulta a timeline de versões manualmente
- Decisão pode ser revista no futuro se aparecer pedido explícito

---

## 22. Limites de storage e performance

- **Sem limite de versões por evento**
- Snapshots ficam todos guardados (jsonb + anexos duplicados)
- Para eventos com BP grande pode acumular MB ao longo do tempo — assumido como custo aceitável
- Admin pode usar arquivamento manual para limpar a timeline visualmente

---

## 23. Cascade no Trash

- Quando um evento é apagado (vai para Trash 30 dias):
  - **Versões seguem o evento no Trash** (não são hard-deleted)
  - Anexos no bucket também ficam
- Restaurar evento do Trash restaura também todas as versões
- Hard-delete após 30 dias apaga evento + versões + anexos do bucket em cascade

---

## 24. Fora do escopo desta primeira versão

- Branching de versões (ex: v3a vs v3b paralelas)
- Merge de rascunhos por utilizador
- Templates de versão entre eventos
- Lock pessimista (decidido: sem lock)
- Rascunhos pessoais por utilizador (decidido: edições são imediatas e partilhadas)
- Notificações automáticas (decidido: sem)
- Labels customizadas / major.minor (decidido: numeração sequencial simples)

---

## 26. Cenários múltiplos (versões nomeadas para análise comparativa)

**Caso de uso**: durante a venda de bilhetes, a previsão de público pode oscilar (ex: BP previa 20k, vendas indicam 12k). Equipa precisa modelar **vários cenários em paralelo** (pessimista / base / otimista) sem promover nenhum, e compará-los entre si e contra o realizado.

### 26.1 Modelo de dados — campos extra em `bp_versions`
- `scenario_label` (text, nullable) — nome curto do cenário: "Pessimista 12k", "Base 16k", "Otimista 20k". Quando preenchido, a versão é **um cenário** (não uma simples revisão).
- `scenario_assumptions` (jsonb, nullable) — pressupostos estruturados: `{ publico_estimado: 12000, ticket_medio: 35, ocupacao_pct: 60, notas: "..." }`. Renderizados como chips no card.
- `is_pinned_scenario` (bool, default false) — cenários "fixados" aparecem sempre na multi-comparação e nos seletores de relatórios. Limite: até **4 cenários fixados** por evento simultaneamente.

### 26.2 Estados aplicáveis
- Cenários vivem como **rascunhos** (estado `draft`) com `scenario_label` preenchido
- Não substituem a versão ativa nem entram em "superseded" — ficam vivos para análise
- Podem ser promovidos a ativos a qualquer momento (vira o BP oficial e perde o estatuto de cenário)
- Podem ser descartados como qualquer rascunho

### 26.3 UI — Timeline com agrupamento
- Timeline divide visualmente: **"Versões oficiais"** (ativa + superseded + arquivadas) e **"Cenários de trabalho"** (rascunhos com `scenario_label`)
- Cada card de cenário mostra: label, pressupostos como chips, total receita/custo/margem, autor, data
- Botão **"Fixar para comparação"** (toggle, máx 4)

---

## 27. Multi-comparação (até 4 versões lado a lado)

- Substitui a comparação 1-a-1 da §10
- Seletor permite escolher **2 a 4 versões** quaisquer (ativa + cenários fixados pré-selecionados por defeito)
- Tabela com colunas dinâmicas: `Linha BP | v3 (ativa) | Pessimista 12k | Base 16k | Otimista 20k`
- Linha de **totais por categoria** (Receitas, Custos diretos, Custos indiretos, Margem) destacada
- Cores: verde se cenário X > ativa, vermelho se <, neutro se igual
- Export PDF mantém todas as colunas selecionadas
- Filtro "só mostrar linhas com diferenças entre as N versões"

---

## 28. Cenários nos relatórios (DRE / PL / Análise de Resultados)

- DRE, PL e Análise de Resultados ganham **dropdown "Comparar com"** no topo
  - Opções: "Nenhum (só real)", "BP ao vivo", "Versão ativa vX", "Cenário: Pessimista 12k", "Cenário: Base 16k", etc.
  - Por defeito: "BP ao vivo" (comportamento atual preservado)
- Quando seleciona uma versão/cenário, surge **coluna extra "vs [nome]"** com o gap absoluto e %
- Permite mostrar a sócios/equipa: "Real até hoje vs cenário pessimista que assumimos em março"
- Outros relatórios (Bilheteria, Vendas, Cashflow, etc.) **continuam a usar só BP ao vivo** — escopo cirúrgico para evitar explosão de complexidade

---

## 29. Promoção de cenário a ativo — destino dos outros cenários

Quando admin promove um cenário (ex: Pessimista 12k) a versão ativa:

1. Modal pergunta: **"Tens 2 outros cenários vivos. O que fazer?"**
2. Para cada cenário restante, opções individuais:
   - **Manter vivo** (continua como rascunho-cenário, útil se ainda há incerteza)
   - **Arquivar** (esconde da timeline mas guarda)
   - **Apagar** (descarta — só rascunhos puros, com confirmação)
3. Botões rápidos: "Manter todos" / "Arquivar todos" / "Decidir um a um"
4. Audit log regista a decisão por cenário

---

## 24-bis. Fora do escopo (atualizado)

Fica de fora desta primeira versão:
- Branching efetivo de versões (cenários NÃO são branches Git — são snapshots paralelos sem merge)
- Templates de cenário entre eventos
- Mais de 4 cenários fixados em multi-comparação
- Cenários no Portal do Sócio (sócio vê só ativa)
- Auto-recálculo de cenários quando vendas mudam (cenários são snapshots, não fórmulas vivas)

---

## 25. Ordem sugerida de implementação

1. **Fase 1 — Schema**: criar `bp_versions`, `bp_version_audit_log`, novos campos em `event_forecasts`, bucket `bp-version-snapshots`
2. **Fase 2 — Backend de snapshots**: função para criar snapshot completo de um evento (incl. cascade Master→Splits + duplicação de anexos)
3. **Fase 3 — Migração one-time**: criar v1 para todos os eventos em planeamento/confirmado/ativo
4. **Fase 4 — Auto-criar v1**: trigger ao mudar evento para "Confirmado"/"Ativo"
5. **Fase 5 — UI base**: card no topo do BP com versão ativa + botão "Congelar"
6. **Fase 6 — Timeline e histórico**: página/modal de versões com cards e arquivamento
7. **Fase 7 — Comparação 1-a-1**: vista lado-a-lado básica + cores + PDF
8. **Fase 8 — Reconciliação automática**: lógica de auto-reconciliar ao aprovar versão (§11)
9. **Fase 9 — Reverter/descartar**: botão destrutivo com confirmação + bloqueio por transações ligadas (§4.1)
10. **Fase 10 — Geração de transações**: escolha da fonte (versão ativa vs BP ao vivo)
11. **Fase 11 — Splits retroativos**: lógica para criar snapshot retroativo de Splits novos (§6.1)
12. **Fase 12 — Portal do Sócio**: label discreto da versão ativa
13. **Fase 13 — Permissões e cascade Trash**: RLS por role + cascade no Trash
14. **Fase 14 — Cenários (schema + UI)**: campos `scenario_label`, `scenario_assumptions`, `is_pinned_scenario` + agrupamento na timeline (§26)
15. **Fase 15 — Multi-comparação 2-4 versões**: extensão da Fase 7 para suportar até 4 colunas (§27)
16. **Fase 16 — Cenários nos relatórios**: dropdown "Comparar com" em DRE/PL/Análise de Resultados (§28)
17. **Fase 17 — Promoção com modal de destino**: fluxo de decisão por cenário ao promover (§29)
18. **Fase 18 — Polish e testes**: cenários canónicos, audit, edge cases
