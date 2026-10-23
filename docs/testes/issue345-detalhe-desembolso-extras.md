# Issue #345 — Detalhe C (desembolso) e D (extras) no documento do sócio

Data: 2026-10-23 · R1 · HEAD de partida da3abb0 · sem DDL/DML/Publish/deploy.

## Lido
- Ficheiros: partner-statement-doc.ts, statement-service.ts, export-partner-statement-doc.ts,
  PartnerSettlementTab.tsx (buildSoloDocInput), src/lib/partner-disbursement.ts (reexport do partilhado),
  memória features/partner-settlement.md (g4, g5, g18, g19).
- Issue #345 NÃO lida: a função github-issues respondeu 401 (pede sessão). Implementado pelo despacho.

## Mudou
- Gerador: campos opcionais paidByPartnerLines, partnerExtrasLines, disbursementAdjustmentLines;
  normalizadores partilhados paidByPartnerDocLines / partnerExtrasDocLines; reconcileDisplayField
  contra paidByPartner / disbursementAdjustments / partnerExtras (totais intocados).
- Export: secções C e D no detalhamento (PDF e Excel), depois do B; omitidas sem linhas.
- Equipa (buildSoloDocInput) e Portal (statement-service) passam as mesmas linhas que formam os totais.

## Testes
- Novo: src/lib/__tests__/partner-statement-detail-cd.test.ts (8 testes).
- Suite antes (da3abb0): 2216 passed / 6 skipped / 11 todo.
- Suite depois: 2224 passed / 6 skipped / 11 todo. tsgo exit 0.
- Limite: o teste "equipa = Portal" compara as duas formas de linhas passadas aos normalizadores
  partilhados; não executa o serviço completo com base de dados.
- CI remoto NÃO verificado.

## Verificar no ecrã (depois do Publish)
Ivete Clareou 2026 · SUPERSOUNDS: total de C = "+ Despesas do evento pagas por SUPERSOUNDS" da secção 5;
total de D = "- Extras". Portal só após reimplantar partner-statement.
