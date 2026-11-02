# Protocolo PostgreSQL sintético de duas sessões — NÃO EXECUTADO

O despacho só autoriza preparar os roteiros. Este documento não é autorização para os executar. Sem PostgreSQL/PGlite novo nesta sessão, sem credenciais ou bases MP e sem APIs/Storage. Usar futuramente uma base descartável chamada `issue486_synthetic`, catálogo fiel com roles/RLS/triggers reais e dependências preservadas, egress e crons desligados no harness. Não substituir helpers canónicos por stubs. A fixture recusa dados preexistentes; resolver dependências da fixture antes do ensaio, sem skips nem desligar triggers.

## Mesma fatura: CAS preparado

1. Instalação/preflight pós-autorização própria; conservar saídas de `pre-verificacoes.sql` e `pos-verificacoes.sql` e os hashes dos artefactos. Correr no futuro `concorrencia-setup.sql`, exclusivamente no contentor descartável. Esse setup tem COMMIT explícito para os dados ficarem visíveis nas duas conexões.
2. Abrir dois processos psql independentes, cada um com backend PID diferente; conservar ambos os PIDs/session_user e transcrições. Executar `concorrencia-fatura-a.sql` em A. A grava revisão 2 mas fica na barreira interactiva antes de COMMIT, com os locks adquiridos.
3. Executar `concorrencia-fatura-b.sql` em B. B pede revisão 1. Observar de uma terceira conexão controladora `pg_stat_activity`/`pg_locks`/`pg_blocking_pids`: B deve aguardar A em advisory lock da empresa. Isto é uma barreira observada; não usar sleeps/tempos como prova.
4. Libertar a barreira A e fazer COMMIT. B deve receber `revision_conflict`; o assert de revisão final =2 deve passar, sem segundo escritor. Se A fizer ROLLBACK em vez de COMMIT, B deve conseguir revisão 2 numa variante separada do roteiro; não confundir esse resultado com o caso de commit.
5. Conservar catálogo, queries de observação, ordem dos commits e resultados. Destruir o contentor somente depois da retenção dos artefactos. Não executar um teste sequencial e chamá-lo concorrente.

A escrita de plano é a única concorrência exercitável neste candidato parcial. Este caso não prova idempotência nem limites de verba durante geração.

## Mesma verba: critério financeiro obrigatório ainda pendente (D1-L1/L2/L5)

Preparar juntamente com o gerador, sem aceitar como verde o `contract_unavailable` actual:

- Base: mesmo tenant, evento/rubrica/BP de 100.00, compromisso pending de 70.00, baseline 100.00; duas faturas confirmadas diferentes, cada uma com 20.00 para esse mesmo BP. Sem outras verbas/transações/âncoras. Ambas obtêm prévia antes do primeiro commit: nenhum aumento individual é necessário nesse instante.
- Sessão A inicia generate e detém os locks empresa/fatura/evento/rubrica/BP numa barreira real antes do commit. Sessão B inicia generate da outra fatura usando a prévia anterior. Observar espera por PID/locks, depois permitir commit A. B tem de reler compromisso=90.00 e recusar a prévia antiga com preview_stale; não pode aplicar o seu custo nem verba.
- B obtém nova prévia: aumento único 10.00, before 100.00, after 110.00. Sem aceite, com accepted=false, sem observação ou com efeito desconhecido: falha integral, nenhum custo/operação/BP/auditoria novo. Com exactamente o aceite e observação exigidos: sucesso atómico, compromisso=110.00, verba=110.00, baseline=100.00, duas operações, uma filha de 20.00 por fatura, mães sem duplicação no resultado e um único aumento de 10.00.
- Variantes: A faz ROLLBACK e B não pode herdar compromisso/verba/auditoria parcial; duas faturas sem efeito de aumento devem ambas caber se compromisso final couber; conflito com criação de BP não produz linhas órfãs. Testar Master/cidades e propósitos diferentes como grupos separados.
- Escritores Ads participantes devem adquirir o protocolo comum. Writers externos não participantes não ficam cobertos por este lock; é necessária análise e prova delimitada antes da promoção, sem afirmar serialização universal.

## Mesma operação: idempotência financeira ainda pendente

Duas sessões geram a mesma fatura/ciclo/request_key/pedido normalizado. Só um conjunto de IDs pode existir; retry tem de verificar acesso e retornar exactamente esse conjunto. Mesma chave com hash/aceites diferentes → request_conflict, sem escrita. Outra chave no ciclo aplicado → resultado existente. Outra fatura com a mesma company/request_key → request_conflict. Retry de operação reverted não regenera. Uma falha injectada depois do primeiro BP/mãe/filha/tarefa/auditoria, separadamente, tem de repor o digest integral de todas as tabelas financeiras/Ads. Não usar uma simulação de falha devolvida como sucesso.

## Matriz financeira/reversão a completar

| Critério | Assert exigido antes de promoção |
|---|---|
| Negação individual | Utilizador com papel platform_admin mas has_permission_in=false não aprova/aumenta/cria, sem bypass por papel; ausência de sessão e tenant alheio não retornam retomas. |
| Fonte/duplicados | invoice_ref exacta em Digital na empresa, ou specification ref. MM/AAAA com fornecedor da plataforma/nulo; fornecedor não resolvido bloqueia conservadoramente; operação própria é reconhecida primeiro. |
| Fonte/BP | Igual total com troca de forecast_id, versão, filho, compromisso ou moeda invalida hash; moeda incompatível não faz FX. Âncora ambígua bloqueia; FK prevalece. |
| Dinheiro | Taxa positiva/negativa integral; ajustes anónimos positivos/negativos com resíduo; base zero não aloca; company/carreira/outside distintos; split Master/cidades conserva cada vínculo; compromisso sem BP entra na rubrica. |
| Atomicidade | Falhas em qualquer fase deixam nenhuma escrita financeira/operacional/auditoria; pendentes e filhas contam; mães e espelhos de Master não duplicam. |
| Documentos | Falha de upload/ligação conserva financial_committed; retries não geram custo/verba; referências exactas, metadata e empresa validadas; todas as tarefas são necessárias para complete. O roteiro documental semeado só testa esta última parcela. |
| Reversão | Cada uma das guardas payment/status paid/paid_amount/settlement/card_session/payments/payment_list/reimbursement items/reimbursement payments/accountant reviews/accounting_exports é testada isoladamente; erro de leitura bloqueia. Nenhum histórico é apagado; BP/baseline ficam; vínculos/grupo/âncoras limpos e ciclo/revisão +1 em um commit. |
| Reimportação | Idêntica aplicada no-op; aplicada diferente applied_invoice_changed; repetição/multiplicidade sem revisão não reutiliza escolhas; fora_sistema/outside não desaparecem; import alterado invalida preview sem apagar correspondências inequívocas. |
| Rollback DDL | Sem dados v1 restaura corpos/ACL antigos; com plano/revisão/ciclo/operação (também reverted), owner/corpo/config divergente ou dependência externa recusa sem DROP CASCADE. |

A matriz não é resultado de teste nem substitui scripts executáveis dos critérios financeiros. A sua concretização e execução ficam explicitamente em D1-L5.
