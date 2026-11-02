# Proposta de memória funcional — #486 D1-C2

Proposta para o coordenador, **não aplicada em .lovable e não publicada**. Origem: candidato #502/df68d4ae5e4c2b467453655185436ffaf1ac7dc3 recuperado por arquivo offline verificado e corrigido em D1-C2. Destino futuro: completar ads-invoices.md sem apagar as regras existentes. Só incorporar comportamento disponível depois de D1/D2/D3, provas e promoção; manter pendências separadas.

O PDF continua a fonte da fatura. Todas as linhas, incluindo taxas/ajustes sem campanha, admitem escolha persistida de evento, custo da empresa ativa ou outside com motivo. Company é incluído na fatura/custo, sem evento/BP; outside é excluído. Ajuste explícito assinado segue integralmente o destino; só o anónimo usa mídia elegível como base proporcional, com reconciliação decimal exata e resíduo determinístico. Carreira TikTok exige conta do PDF atestada e ligação atual empresa/conta/campanha/música/artista; nome de campanha e código isolado não provam essa ligação.

V1 só gera fatura EUR em empresa cuja companies.currency seja EUR. Empresa, fonte, fornecedor/conta, permissões, BPs, compromissos, eventos/fechos e plano materializam a prévia/hash; alteração exige nova revisão da prévia antes dos efeitos. Importação/plano de outras moedas permanecem possíveis, sem FX implícito. Ausência/ambiguidade bloqueia; não preenche moeda nem cria fornecedor para passar.

Fornecedor vem de ID/NIF documental atestado e único no tenant, com conta/ligação/plataforma e digest da fonte revalidados. Maiúsculas são convenção de cadastro, sem valor de identidade. A memória TikTok indica “TikTok Information Technologies UK Limited”; não codificar nomes/IDs/NIFs operacionais presumidos. A ausência dos dados canónicos é gate de promoção.

O utilizador seleciona BP/finalidade; nunca se escolhe a maior verba. O lote valida linha e rubrica: BP100 + compromisso70 +20+20 exige um aumento10 único, com aceite/observação por efeito. Criação passa pelo batch canónico em draft e aprovação com selos/gates próprios; deny prevalece inclusive em platform_admin. Aumento preserva baseline e usa uma auditoria canónica. transactions.forecast_id é o vínculo N:1. Mãe/filhas/parcelas, efeitos, auditorias, operação e tarefas comprometem juntos ou nada persiste; retry retorna IDs estáveis.

Original fiscal só na mãe; comprovativo por filha, não contabilístico. Financial_committed não significa documentos concluídos. D3 faz bytes/Storage/PDF e confirma digest/vínculo antes do callback service-only; retoma documental não gera custos. Reversão respeita todos os impedimentos financeiros/contabilísticos/fechos e conserva operação, BP/baseline e fonte original.

Confirmação/desconfirmação/reversão produzem tarefas de manutenção ordenadas e vinculadas a tenant/ação/revisão/IDs. O contrato service-only list/ack/retry conserva recibos e erros, com retry explícito limitado; não pressupõe callback/cron externo. D3 é responsável pelo consumidor serial, efeitos externos idempotentes e prova de drenagem. SQL não torna HTTP/Storage atómico.

Operation/preview/list leem sem cerco financeiro. Generate/revert mantêm cerco global conservador finito, incluindo configuração empresarial; a contenção entre empresas precisa de prova/aceitação. Conversão v0 ainda usa SHARE contra escritores legados; os outros comandos curtos usam locks compatíveis antes das linhas. Nenhuma guarda financeira global/#413/#404 é substituída.

V1 permanece enabled=false. Esta proposta não declara SQL compilado, P1–P9 aprovados, fornecedores/dados instalados, D1/#486 concluídos ou UI disponível. Lacunas de preparação e gates estão em verificacao-local.md. Não reexecutar saneamento histórico, #475/#457 ou recolha/alocador existentes.
