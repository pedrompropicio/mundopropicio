# IVA 23% do repasse inclui transferências MP já feitas ao sócio

## Ficheiros lidos
- `.lovable/memory/features/event-settlements.md` — (g4) adenda 13/09, (g4·2), (g5), (g14)
- `docs/INDEX.md`
- `supabase/functions/_shared/settlement/partner-disbursement.ts`, `partner-statement-doc.ts`
- `src/components/PartnerSettlementTab.tsx` (ecrã: cálculo nas linhas ~1245-1249; "IVA 23% sobre o repasse" na linha ~2228; carga das contas de acerto nas linhas ~380-400)
- `src/lib/export-partner-disbursement.ts`
- RPC atual: `supabase/migrations/20260913060148_…sql` (`get_partner_settlement_summary`, IVA só sobre `v_base > 0`)

## Regra
- Só com `transfer_with_vat = true`:
  - `mpTransfersAdvanced` = Σ receitas paid/approved, não estornadas, no evento, em contas com `partner_id` do sócio, categoria 10.3 (código `10.3` ou `10.3.*`).
  - `ivaBase = max(0, transferBase + mpTransfersAdvanced)`
  - `transferVat = calcIvaAmount(ivaBase, 23)`; `transferTotal = transferBase + transferVat`
  - `invoicedTotal = ivaBase + transferVat` (só apresentação)
- Sem a opção: tudo igual. `transferBase` e `financingToReturn` não mudam. Motor não é tocado.

## Passos
1. **Partilhado** (`_shared/settlement/partner-disbursement.ts`): `RevenueHeldRow.isMpTransfer?: boolean`; funções puras `partnerMpTransfersAdvanced(rows, partnerId)` (só `source='settlement_account'` + `isMpTransfer`) e `partnerTransferIvaBase(transferBase, mp)`. `src/lib/partner-disbursement.ts` só reexporta.
2. **Carga** (PartnerSettlementTab, consulta das entradas das contas de acerto): acrescentar `account_categories(code)` ao select e preencher `isMpTransfer`.
3. **Ecrã**: cálculo usa a nova base; linhas novas sob "Base a transferir": "Transferências já feitas pela MP", "Base do IVA", "+ IVA 23% sobre o repasse", "Total a transferir", "Total faturado". Só visíveis com a opção ativa.
4. **Documento** (`partner-statement-doc.ts`): input `mpTransfersAdvanced?`; IVA local sobre `ivaBase`; `*Override` continuam a mandar (g15-b); saída ganha `transferVatBase`, `mpTransfersAdvanced`, `invoicedTotal`; TERMS pt-PT/pt-BR: "+ IVA 23% sobre o repasse (base do IVA = transferências já feitas + saldo)" e "Total faturado". Ecrã passa os novos valores ao doc. Sem termos de `FORBIDDEN_DOC_TERMS`.
5. **Export de conferência** (`export-partner-disbursement.ts`): linhas Base do IVA, IVA e Total faturado.
6. **RPC Portal**: novo ficheiro em `supabase/migrations/` com `CREATE OR REPLACE get_partner_settlement_summary` (mesma assinatura e colunas; IVA sobre a nova base; total faturado não acrescentado como coluna, para não mudar o tipo de retorno — exige DROP). **Não aplicado.** Teste estático do ficheiro.
7. **Verificação só leitura** (SELECT) em Live: confirmar que as entradas 10.3 da EIN na Anitta somam 905.000,00 e que Oeiras/bengaleiro não são 10.3.
8. **Testes** em `src/lib/__tests__/` (vitest + tsgo): os 7 casos pedidos (Anitta/EIN números exatos; Oeiras 50.000 + bengaleiro 138,82 excluídos; sem opção = atual; base negativa; sem contas de acerto; paridade; estanque). Mais teste de que parte da Anitta 418.598,65, Lobo 59.799,81 e resultado 760.576,69 não dependem destas funções (motor intacto).
9. Memória (g4 adenda) atualizada com a nova regra.

## Fica por aplicar no fim
- Migração da RPC do Portal (precisa do teu «Sim»), e Publish.
- Verificação: Encontro de Contas MP + EIN (Anitta) → base 179.892,22 · transferências MP 905.000,00 · base do IVA 1.084.892,22 · IVA 249.525,11 · total a transferir 429.417,33 · total faturado 1.334.417,33; PDF do sócio com os mesmos números.

## Pressuposto a confirmar
- Categoria 10.3 = código `10.3` e todos os filhos `10.3.*`.
