# Plano de Refatoração — Consolidação de Fluxos e Redução de Redundância

> ⚠️ Este plano é apenas uma proposta. **Nada será implementado** sem nova aprovação fase-a-fase.

---

## 🎯 Objetivo geral
Reduzir a curva de aprendizagem e o risco de erro operacional, consolidando fluxos paralelos que hoje resolvem o mesmo problema de formas diferentes — sem perder nenhuma funcionalidade existente.

---

## FASE 1 — Unificar Classificação "Fora do BP" *(prioridade ALTA)*

**Problema atual**: 4 caminhos para resolver "esta despesa não está no BP do evento certo":
- Adoção em massa via `OrphanTransactionsModal` (Master)
- Botão "Adotar" (↗) linha-a-linha no BP Master
- `LocalReinforcementDialog` (sub-evento)
- Bypass "Fora do BP" com justificativa

**Proposta**:
1. Criar **1 wizard único** `ClassifyTransactionWizard` invocado sempre que uma transação é criada/editada sem linha BP correspondente.
2. O wizard detecta o cenário automaticamente:
   - Linha existe no BP do evento → vincular (sem perguntar)
   - Linha existe no BP Master + valor consistente em todos os splits → propor adoção como rateio
   - Linha existe no BP Master mas valor diverge → propor reforço local
   - Linha não existe em lado nenhum → propor bypass com justificativa obrigatória
3. Manter as ferramentas de bulk (`OrphanTransactionsModal`) apenas para limpeza de histórico.

**Risco**: Médio. Requer testes exaustivos do fluxo de bypass para não quebrar auditoria.

---

## FASE 2 — Consolidar Flags de Exclusão de Resultado *(prioridade ALTA)*

**Problema atual**: 6 flags fazem variantes de "isto conta no PL?":
`is_transitory`, `exclude_from_result`, `is_hidden`, `pl_override_note`, `is_reimbursement`, `pl_mode`.

**Proposta**:
1. Manter colunas técnicas como estão (não migrar dados).
2. Criar **1 campo derivado** `pl_inclusion_status` (enum) calculado por view:
   - `included` (default), `excluded_transitory`, `excluded_manual`, `excluded_hidden`, `excluded_reimbursement`
3. Modal único "Estado de inclusão no PL" no editor da transação.
4. Relatórios passam a filtrar por `pl_inclusion_status` em vez de combinar 6 flags.

**Risco**: Médio-alto (afeta cálculos contábeis). Exige paridade testada.

---

## FASE 3 — Reduzir Relatórios Financeiros *(prioridade MÉDIA)*

**Problema atual**: 10 relatórios respondem a variações da mesma pergunta.

**Proposta**:
1. **1 relatório unificado** `/relatorios/financeiro` com sistema de **presets** (DRE Padrão, DRE Brasil, DRE Empresarial, Rentabilidade, Mix, Evolução, Desvio, BP vs Real).
2. Páginas antigas como **redirects** durante 30 dias.
3. Cada preset = configuração serializável (filtros + agrupamento + colunas).

**Risco**: Baixo (puramente UI). Trabalho extenso.

---

## FASE 4 — Importação de Bilheteira Unificada *(prioridade MÉDIA)*

**Problema atual**: 4+ parsers (Ticketline PDF/XLSX/Zone, BOL, Coala V2) cada um com modal próprio.

**Proposta**:
1. **1 único modal** `ImportTicketSalesModal` com dropzone universal e auto-deteção de formato.
2. Parsers existentes isolados em `src/lib/ticket-parsers/` com interface comum.

**Risco**: Baixo. Os parsers já existem e funcionam.

---

## FASE 5 — Vista Única de Pagamento por Transação *(prioridade MÉDIA)*

**Problema atual**: Histórico de pagamento espalhado por 5 tabelas.

**Proposta**:
1. Tab "Pagamento" no `TransactionEditModal` com **timeline consolidada** (parcelas + lista de pagamento + reembolso + sócio + crédito).
2. Manter tabelas como estão. Adicionar view SQL `transaction_payment_timeline`.

**Risco**: Muito baixo. Pura adição.

---

## FASE 6 — Painel "Permissões Efetivas" *(prioridade BAIXA)*

**Proposta**: Tab "Resumo Efetivo" no `UserPermissionsModal` mostrando role, permissões herdadas, overrides, contas e eventos acessíveis. Sem alterar modelo de dados.

**Risco**: Mínimo.

---

## FASE 7 — Limpeza de Memórias Obsoletas *(prioridade BAIXA)*

Auditar ~80 memórias, remover refs a terminologia antiga (Pai/Filho), consolidar duplicados.

**Risco**: Nenhum.

---

## 📊 Priorização sugerida

| Fase | Impacto UX | Risco | Esforço | Recomendação |
|------|-----------|-------|---------|--------------|
| 1. Wizard classificação | Alto | Médio | Médio | **Primeiro** |
| 2. Flags PL | Alto | Médio-alto | Médio | **Cedo** |
| 5. Timeline pagamento | Médio | Baixo | Baixo | Quick win |
| 4. Import bilheteira | Médio | Baixo | Baixo | Quick win |
| 3. Relatórios | Médio | Baixo | Alto | Opcional |
| 6. Painel permissões | Baixo | Baixo | Baixo | Quando sobrar |
| 7. Limpar memórias | Baixo | Nulo | Baixo | Ongoing |

---

## ❓ Próximo passo

1. Aceitar este plano como base?
2. Que fase(s) priorizar?
3. Alguma fase a remover?

**Nada será mexido até nova ordem.**
