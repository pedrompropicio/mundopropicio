# Estado — Fecho Anitta EDA 2026

Chat `fecho-anitta-2026`. Evento `fdfb39fe-45f2-43f5-9ec9-7cb536360ae1`. Ficheiro vivo: reescreve-se por cima.

## Em que pé está (13/10/2026)

- Números em Live: receitas 2.527.352,94 € · despesas c/IVA 1.929.354,87 € (190 linhas de BP, 58 rubricas) · resultado 597.998,07 € · EDA 70% 418.598,65 € · sócios locais 30% 179.399,42 €.
- Card do evento e relatório de fecho batem ao cêntimo desde a criação da rubrica 2.6.15 (D-ERP255); excedido do evento 0,00.
- Fecho enviado ao Daniel (Rodamoinho) e ao Lobo (Vybbe) a 13/10/2026, na thread "Fecho EDA 2026 Portugal", com o ficheiro Fecho_Anitta_EDA_2026_actualizado_13out.xlsx (Resumo do Fecho + Detalhamento).
- Os três fechamentos (Anitta, Rafael Lobo, MP + EIN) não estão selados.

## A trabalhar agora

- À espera das orientações da EDA sobre os repasses.

## Pendências

1. Linha 2.5.03 `280429ac-7d6c-4ede-9e21-4f1d2d8273d0`: "Redução de verba" de 28/09/2026 11:55 (7.692,32 → 4.814,09) sem observação — falta o critério da Juliana. A descrição ainda diz "29.538,54 reais"; os 5 itens a 6,3074 somam 4.814,09 €.
2. Linha do Grupo Onda — quem pagou: falta fatura ou extrato. Nada se escreve até haver documento.
3. Selar os fechamentos (PROC-fecho-evento, passo 10) depois da resposta da EDA.
4. Issue #312: vínculo das 4 taxas (forecast_id ainda aponta para 2.2.05 e 2.6.08) e a linha "Despesas bancárias" 4.238,27 € em 2.9.03.

## Factos que não se reinvestigam

- Oeiras, Ticketline 1% e bengaleiro (72.250,52 € s/IVA) são exclusivos do Fechamento MP + EIN e ficam fora do resultado do evento.
- A ANITTA não pagou nenhuma linha deste evento: pagadora em 0 linhas, can_pay = false, 0 despesas pagas por sócio.
- A diferença de 80,40 € entre card e fecho eram 4 taxas bancárias na 10.6.01, sem linha de BP — resolvida com a 2.6.15.
- Verificação de IVA: o sistema arredonda linha a linha; somar o IVA por rubrica dá cêntimos de diferença.
- Coluna Documentos do fecho: por rubrica = documentos das transações da rubrica + anexos das linhas de BP; por linha = anexos da linha + documentos das transações com forecast_id dessa linha.

## Onde ler mais

- docs/DECISIONS.md (D-ERP255)
- Issues #312 e #223
- .lovable/memory/features/partner-settlement.md (cascata dos fechamentos)
