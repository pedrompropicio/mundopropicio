# Proposta de memória #486 — não publicada

Aplicar em `.lovable/memory/features/ads-invoices.md` pelo coordenador apenas depois da aceitação/promoção conjunta D1/D2/D3 e verificação funcional. Esta entrega não altera .lovable nem o comportamento publicado.

- PDF continua fonte; Ads v1 liga revisão/confirm a fonte atestada por worker que leu bytes, ao plano persistido e à prévia canónica SQL.
- Taxas/ajustes admitem event/company/outside; company é custo incluído sem evento. Só anónimo admite prorate; explícito segue integralmente o destino; dinheiro reconcilia exatamente.
- Filhas agrupam destino/evento/rubrica/BP/finalidade e retêm parcelas; forecast_id é canónico; escalar Ads não representa N:N.
- Prévia agrega compromisso/lote por linha e rubrica; criação/aprovação e aumentos exigem aceites/observações individuais e permissões com deny prevalecente. Baseline e auditoria são canónicas.
- Geração v1 só EUR, sem FX/fornecedor/pagamento/data inventados; importação/plano conservam a moeda e erro explícito.
- Generate grava BP/grupo/vínculos/operação/tarefas atomicamente; request hash vincula aceites e retry recupera IDs originais. Revert conserva BP/auditoria/histórico e impede regenerar pedido terminal.
- Guardas específicas Ads usam contexto privado backend/transação/ação/IDs, sem bypass de role/GUC. Controlo nasce disabled; catálogo, compatibilidade D3 e drenagem são gates separados.
- Original contabilístico só mãe; comprovativo não contabilístico por filha. Worker confirma bytes/digest/vínculo antes de concluir. Falha documental não repete custo.
- Não afirmar comportamento disponível antes de dossier funcional publicado: este candidato continua sem compilação/provas PostgreSQL e com lacunas P1–P9 registadas em verificacao-local.md.
