# #486 · candidato D1-I para revisão

R2 exclusivamente preparado em 02/11/2026. Fonte recuperada: os 17 blobs #492, commit `0f12a5257b2dfe6b42759c486c012b1555042872`, arquivo SHA256 `dddf58460e4f51dce19d328ac03c39d645dffa671695c0dc1eda4fece36f6e80`. Checkout observado `b8d76d17ae1cafcff40820cc8b79eeced862de87`, inicialmente limpo, 0305 livre. Não houve SQL novo executado, serviço MP, rede, instalação, deploy, commit ou push. O runner é responsável pelo PR autónomo; merge automático deve permanecer desligado. CI, autorização/fila e integração documental do HEAD aprovado são gates do coordenador, não inferidos deste checkout.

## Superfície RPC e acesso

Todas as assinaturas estão em `function-identities.tsv`. Funções SECURITY DEFINER usam search_path fixo; helpers `_ads486_*` e tabelas de operações/contexto não têm grants de cliente/service_role. Os invoker de pendências preservam RLS. Falhas não devolvem sucesso parcial.

`ads_invoice_generation_v1(uuid,text,jsonb DEFAULT '{}') → jsonb`, EXECUTE authenticated. Resolve auth.uid(), empresa ativa e papel admin/manager/editor/accountant/platform_admin da empresa. Não aceita ator/tenant delegados. Requests rejeitam chaves desconhecidas, UUIDs não canónicos, revisões não inteiras ou superiores a 9007199254740991, montantes não textuais ou com centésimos fracionários.

| Ação | Payload | Resposta |
|---|---|---|
| save_plan | `{expected_revision,plan:PlanV1}` | `{contract_version:1,invoice_id,revision,generation_cycle,plan}`; proposed, CAS, revisão +1, confirmação invalidada. |
| preview | `{}` ou `{expected_revision}` | `{contract_version:1,invoice_id,revision,generation_cycle,currency,preview_hash,allocations,children,line_budgets,category_budgets,effects,blockers,totals}`. Usa apenas plano persistido. |
| confirm | `{expected_revision,preview_hash}` | `{contract_version:1,invoice_id,revision,status:'confirmed'}`; grava revisão/hash revistos e selos de servidor. Pode rever confirmação após fontes financeiras mudarem; repetição exata não cria tarefa extra. |
| generate | `{request_key,expected_revision,preview_hash,approvals}` | `{contract_version:1,invoice_id,revision,generation_cycle,operation:Operation,already}`. Efeitos e valores vêm da prévia revalidada. |
| operation | `{}` | `{contract_version:1,invoice_id,revision,generation_cycle,operation:null\|Operation,maintenance}`; acesso revalidado antes dos IDs, inclusive reverted. |
| set_split | `{expected_revision,line_id,parts:[{event_id,amount,source?}]}` | `{ok:true,contract_version:1,invoice_id,revision,parts,cleared}`. Montantes textuais exatos; apenas mídia, família/tenant validados. Invalida allocations da linha alterada e elimina propostas sem uso, conservando as outras escolhas. |

`ads_invoice_line_set_tour_split(uuid,jsonb)` conserva assinatura e comportamento v0. O ramo v1 delega no comando antes do antigo FOR UPDATE; converte apenas montantes numéricos já exatos em strings. Não arredonda para autorizar. D3 deve recolher BP de cada nova parcela.

Approval é exatamente `{effect_id,accepted:true,observation}`. O conjunto coincide com os efeitos atuais, sem repetidos/extras/omissões, com observação individual não vazia. Aceites não fazem parte de PlanV1. O request_hash SHA256 vincula ação, fatura, ciclo, revisão pedida, hash da prévia e aceites ordenados, incluindo observações. Mesma chave/pedido retorna a operação gravada antes de recalcular; chave alterada na mesma empresa recusa; outra chave num ciclo aplicado devolve o resultado existente. Retry da chave original após revert permanece terminal, sem regeneração. Novo ciclo requer chave e confirmação novas.

## Plano, dinheiro e BP

PlanV1 = `{version:1,allocations:Allocation[],new_forecasts:NewForecast[],budget_proposals:BudgetProposal[]}`. Arrays normalizados por identidade sob collation C; dinheiro = string decimal de duas casas, máximo 12 algarismos inteiros. Allocation = `{key,line_id,destination,amount,observation,event_id?,forecast_id?,new_forecast_key?}`; key ASCII `[A-Za-z0-9_-]{1,80}`. `event` requer exatamente um BP vivo/aprovado do mesmo evento ou chave de criação. `company` é custo incluído da empresa ativa, sem evento/BP; `outside` requer motivo e sai do resultado; `carreira` exige TikTok e prova atual; `prorate` só ajuste anónimo sem campanha/evento/split. Ajuste explícito positivo/negativo é integral, sem segundo rateio.

NewForecast = `{key,event_id,category_id,description,specification,currency,amount,observation}`. BudgetProposal = `{forecast_id,new_amount}`. Descrição/finalidade explícita; não eleger BP por verba ou descrição genérica. O candidato usa a categoria Digital canónica já existente, validando tenant/tipo/L3. Nenhum fornecedor/categoria/FX/data/pagamento é criado para suprir ausência de fonte.

Prévia é o único cálculo v1: soma exata por linha e fatura, mídia elegível como base de rateio, outside excluído, resíduo na maior base com desempate por chave C. Grupos destino × evento × rubrica × BP/finalidade retêm as parcelas originais. Child = `{key,destination,event_id,category_id,forecast_id,new_forecast_key,amount,source_line_allocations:[{key,source_key,line_id,amount,prorated}]}`. FK `transactions.forecast_id` é N:1; âncora legada só pelos automatismos canónicos, sem sobrescrever âncora válida. Escalar da linha Ads só quando uma única filha representa todo o vínculo; N:N permanece no snapshot.

Compromisso inclui pending/approved/paid e filhas elegíveis; flags de resultado, transitório, hidden, reversed e shared_cost excluem. Uma mãe só sai após provar composição integral/moeda; FK prevalece sobre âncora; ambiguidade bloqueia. Verba100 + compromisso70 + 20+20 → um efeito raise de 10 para 110. Linha e rubrica são validadas separadamente; défice residual não escolhe automaticamente onde elevar. Parcelas adotadas não autorizam duplicar verba da raiz; o candidato bloqueia composição Master ambígua e aumento de linha protegida/retroativa. A matriz de adoção Master/cidades ainda carece das provas indicadas no resumo.

Geração é só EUR. Importação/plano conservam a moeda original; outras moedas, BP/compromisso incompatíveis ou metadados inconsistentes recusam antes do commit. Não há fallback financeiro legado. Child de valor zero/negativo ou total incluído não positivo bloqueia `unsupported_financial_shape`, conservando o ajuste assinado no plano. A inclusão de ajustes negativos em grupos positivos mantém o sinal e a reconciliação.

Generate requer manage_transactions + approve_transactions por has_permission_in; raise requer raise_budget; create requer manage_bp + papel canónico de aprovação (admin/manager da empresa ou platform_admin). Deny individual prevalece inclusive para platform_admin. Sem aprovação suficiente, zero escrita; pode selecionar BP previamente aprovado. Criação chama batch_save com os cinco argumentos, verifica draft/tenant/EUR/baseline, aprova com approved_at/approved_by textual e promove planning/confirmed a active como o BP. Elevação chama raise_forecast_budget uma vez e retém referências da auditoria canónica; changed_by é texto; baseline existente não muda.

Fornecedor é resolvido por identidade exata já cadastrada: META PLATFORMS IRELAND LIMITED, GOOGLE IRELAND LIMITED ou TIKTOK INFORMATION TECHNOLOGIES UK LIMITED, na empresa. Ausência/ambiguidade bloqueia; não escolhe primeiro resultado por heurística. Reutiliza IVA 0, Meta NET60/transfer, Google/TikTok vencimento na emissão/direct_debit, estado approved; falta de issue_date bloqueia. A correspondência destes nomes com entidades reais é gate operacional, sem consultas reais neste PR. Duplicados usam Digital/empresa + invoice_ref exata ou referência MM/AAAA/fornecedor-nulo, conservando separadores; Fatura Avulsa com número exato bloqueia conservadoramente, pois não tem FK supplier_id.

Commit PostgreSQL único: BP/aprovação/auditoria/snapshot, mãe sem evento pelo total incluído, filhas, vínculos, operação, tarefas e applied. Qualquer exceção desfaz tudo. Result_snapshot imutável conserva parent/children/parcelas/efeitos/aceites/fonte/parâmetros/prévia e fotografia financeira, sem segunda fórmula. Operation tem UNIQUE(invoice,cycle) e UNIQUE(company,request_key), estado financial_committed/complete/reverted, autoria e plano congelados. Não se chama approve_transactions_atomic service-only.

## Fonte e importação

`ads_invoice_import_v1(p_invoice jsonb,p_lines jsonb)` apenas authenticated. Header estrito `{company_id,platform,invoice_number,currency,billing_period,issue_date,total_amount,lines_sum,source:'pdf',source_ref,file_path}`; datas ISO, total/lines_sum textuais. Linha `{line_no,raw_description,placement,campaign_name,external_campaign_id,amount,is_adjustment}`; campos de campanha/placement anuláveis. Nunca recebe match_source/digest/escolhas do cliente.

Resposta `{contract_version:1,invoice_id,status,revision,identical,preserved_line_ids,unresolved_line_ids,removed_line_ids?,ambiguous}`. Tuplo de identidade tipado preserva NULL vs vazio e separadores, ignora line_no. Multiconjunto idêntico é no-op, inclusive aplicado; alteração só preserva 1:1. Ambíguos não reutilizam decisões; outside/fora_sistema perdido recusa tudo. Alteração invalida atestação/confirmação/hash; applied diferente recusa. Não saneia histórico.

`_ads486_classify_tiktok(uuid)` resolve apenas prova inequívoca empresa → ligação ativa/conta identificada → external_campaign_id → música, sem evento. Retém ligação/conta/código/música, sem juntar por nome. Mesmo código em várias contas fica por resolver. A prévia volta a validar a prova atual. Não prova que o parser foi validado num PDF real, nem infere a conta do PDF a partir de nomes.

`ads_invoice_source_attest_v1(uuid,bigint,jsonb)` só service_role, payload exato `{company_id,bucket:'ads-invoices',path,sha256}`. D3 lê/arquiva os bytes efetivos, volta a validar a extração do cabeçalho/linhas contra a revisão persistida e só então chama com essa expected_revision; o digest isolado não prova os valores extraídos. SQL verifica tenant/revisão/caminho/estado, fixa digest/referência, incrementa revisão quando diferente e invalida confirmação. Cliente não pode declarar estes campos. PostgreSQL não lê Storage. Sem atestação válida, a prévia bloqueia e nenhuma confirmação financeira passa.

## Reversão, reabertura e documentos

`ads_invoice_reopen_v1(uuid,bigint)` apenas authenticated com manage_transactions; só confirmed sem grupo ativo, conserva plano, revisão +1, invalida confirmação e enfileira destranca. Não exige prévia completa para reparar proposta.

`ads_invoice_revert_v1(uuid,uuid,bigint)` apenas authenticated com manage_transactions. Acesso, operação corrente/ciclo/revisão e composição exata são revalidados. Bloqueiam status/paid_amount, settlement/card_session, transaction_payments, payment_list_items, reimbursement_note_items, reimbursement_notes.payment_transaction_id, accountant_transaction_reviews, exportação contabilística cobrindo a data, evento fechado/histórico/cancelado e fecho selado. Erro de consulta não é ausência de impedimento. Limpa âncoras/escalares/grupo/selos, incrementa revisão/ciclo uma vez, conserva plano/BP/baseline/auditoria/operação reverted. Criações aplicadas passam a seleções do BP criado no próximo ciclo; propostas de aumento já aplicadas deixam de ser pedidos novos. Não destrói nem baixa BP.

`ads_invoice_document_complete_v1(uuid,text,jsonb)` só service_role. Payload `{company_id,transaction_id,bucket,path,status:'complete'|'error',error_code?,sha256?}`. Complete exige digest SHA256; original igual à fonte; erro exige código allowlisted. Esta extensão explícita do callback #492 exige adaptadores D2/D3 atualizados em conjunto. Metadados fiscais/transação/path vêm da tarefa. Tarefa = `{key,transaction_id,bucket,path,name,doc_type,is_accounting,status,document_id,error_code,sha256?}`. Original só mãe/fatura/accounting=true; proof:<child.key> só filha/comprovativo_veiculacao/accounting=false. Paths determinísticos por empresa/operação. Retry completo confere referência/digest e retorna o mesmo document_id; vínculo duplicado/divergente bloqueia. Todos completos → complete; falha mantém financial_committed. D3 deve confirmar bytes por readback, não apenas upload/path/tamanho.

Reversão regista manutenção com operação e tarefas/documentos preservados. Original no bucket Ads nunca é apagado; D3 limpa cópias só após commit, verifica referências e usa storage-trash. Filas de confirmação/reopen/revert são `generation_maintenance`; o consumidor/ack desse trabalho é dependência D3 ainda por fechar, discriminada no resumo. Sem worker neste PR, nenhuma ação externa ocorre.

## Locks, guardas e ativação

`ads486_private.control.enabled=false` na instalação. Todas as mutações novas verificam o controlo; leituras/retries terminais sem efeitos podem recuperar operações. Não há endpoint de ativação. D1/D2/D3 não ativam por merge; instalação, compatibilidade de todos os writers e drenagem comprovada exigem autorização posterior. Versão/tempo decorrido não prova ausência de handlers antigos nem cancela HTTP/Storage já iniciados.

`_ads486_fence` enumera a união conservadora das relações de todos os comandos, incluindo callbacks e fontes canónicas conhecidas, na ordem de nome qualificado, SHARE ROW EXCLUSIVE antes de advisory company→invoice, fatura, linhas, eventos/BP e operação. Isolamento READ COMMITTED obrigatório; releitura após esperas; sem upgrades tardios entre comandos novos. Limites locais 2s lock/15s statement, cuja efetividade/duração exige medição PostgreSQL. Timeout/deadlock aborta integralmente, sem retry financeiro automático. O cerco bloqueia temporariamente escritores de outras empresas; custo explícito sujeito a aceitação, sem promessa de não contenção.

Contexto privado owner-only vincula PID/txid/ação/fatura/IDs exatos; não confia em role/GUC do cliente. Guardas próprias protegem invoice, lines, transações do snapshot/identidade exata e unlink da âncora BP. OLD e NEW são considerados; linha relê pais por UUID. Pagamentos que só mudem status/paid_amount/payment_date continuam pelos caminhos canónicos e impedem reversão. A compatibilidade das demais colunas canónicas de pagamento é gate de ensaio. Nenhum trigger/regra global ou objeto #413/#404 é substituído. Catálogo/fechos/pagamentos preservados dependem de preflight completo e prova fiel, sem aprovação operacional implícita.

## Erros e gates

| SQLSTATE | Códigos principais / resposta D3 |
|---|---|
| 28000 | unauthenticated → 401 |
| 42501 | forbidden, bp_approval_required, ads_v1_command_required, ads_v1_identity_immutable → 403 |
| P0409 | revision_conflict, preview_stale, request_conflict, duplicate_invoice, confirmation_required, applied_invoice_changed, revert_blocked → 409 |
| P0422 | invalid_plan, allocation_required, currency_mismatch, generation_blocked (blockers), approval_required, source_attestation_invalid, document_digest_mismatch → 422 |
| 0A000 | feature_disabled → 503; nenhuma implementação financeira substituída por contract_unavailable |
| 55P03 / 40P01 / 57014 | timeout/deadlock/cancelamento → falha integral; consultar operation antes de qualquer repetição incerta |

L1–L4 são candidatos de código sujeitos a revisão, compilação SQL e gates P1–P9 posteriores. Roteiros preparados não equivalem a provas aprovadas. L5 tem lacunas de cobertura enumeradas em verificacao-local/resumo. L6 inclui cópia byte-idêntica, inventário final, captura de pré-imagens, manifesto de catálogo e rollback comentado RESTRICT; não foi ensaiado. Não se declara D1 ou #486 concluídos.
