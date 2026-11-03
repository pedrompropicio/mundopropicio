# #486 — D1-C3: candidato e roteiros para revisão

Entrega de preparação em 02/11/2026. Esta versão substitui o plano D1-P/#496 quanto ao estado da entrega; preserva as regras e a sequência D1→D2→D3. Não declara D1/#486 concluídos. Nenhum SQL novo foi executado ou compilado.

## Proveniência e âmbito

Base local limpa `d1ac522f9e59652a6e34d960fbf77a22f5c0b09c`. Pacote #506 HEAD `3e4dba865515d69b24a027aa25be0675034e81d2`, arquivo de63.449 bytes com SHA256 `5eb917ed071e0ffbec40bd7a26f352f808e28a9c0a8472d8dcdfd0dd6f2cd6a1`: arquivo, versão3, commit e cada um dos22 blobs conferidos antes da recuperação, incluindo a cópia manual idêntica. Fontes recebidas são código público versionado e tipos públicos de main `15d8203743f01549108f511fa4da604bf36fce19`, sem catálogo instalado ou dados MP. Não integrar #492/#502/#506 para obter fontes. CI `quality41538984338/job125597990083 success` é informação do despacho; a reconfirmação remota do coordenador não foi reproduzida pelo executor.

Lidos INDEX, QUADRO pertinente, estados Tráfego Pago e Vínculo BP, PROC-despacho-executor/PROC-promocao/PROC-entrada-de-dados, plano integrado anterior e memórias `ads-invoices.md`, `bp-planilha.md`, `bp-excesso-de-verba.md`, AGENTS raiz/supabase/data-entry. Não há AGENTS adicional em docs/drizzle. Escrita limitada aos27 caminhos do despacho, sem editar memória publicada, workflows, meta, env ou consumidores.

| Pedido | Nesta entrega | Dependência posterior |
|---|---|---|
| Ajustes/taxas, evento/company/outside/carreira, splits, Master/cidades/finalidades | Contrato/persistência/prévia/geração candidatos e roteiros conservados/ampliados | D2 sugestões; D3 modal e escolha humana |
| BP por linha/rubrica/lote, criar/aumentar/aceitar | Candidato atómico, deny/selos/baseline/auditoria, cenário multi-efeito | D3 experiência no mesmo modal |
| Tenant/moedas/hash/retry/duplicados/reimport/confirm/reopen/revert/writers | Candidato e cenários P1–P9 preparados | Catálogo fiel/compilação/ensaio e consumidores D2/D3 |
| PDF/original/comprovativos/retoma/manutenção | Contratos de atestação/list/ack/retry e roteiros | D3 bytes/Storage/PDF/readback/worker/drenagem |
| Identidades/ACL/pre/pós/rollback | Manifesto corrigido, inventário derivado e rollback comentado RESTRICT | Instalação/ensaio/promoção com autorização própria |
| Tipos/UI/i18n/memória | Contrato e proposta documental de memória | D2/D3 atualizam consumidores e memória efetiva juntos |
| Histórico omitido, #475/#457, #413/#404 | Sem saneamento ou alteração dos controlos | R2/Sim próprios; não repetir matriz/alocador/recolha |
| Execução/deploy/ativação/Publish/merge | Nenhum | Fora deste despacho |

## L1–L6 e alterações concretas

| Camada | Candidato final |
|---|---|
| L1 geração | RPC única sob sessão/tenant; confirmação/revisão/hash vinculados; operação imutável por empresa/chave e fatura/ciclo; IDs estáveis; mãe/filhas/links/documentos no mesmo commit |
| L2 BP e moeda | `batch_save_event_forecasts` cria draft, aprovação canónica com selos/deny; raise canónico uma vez; EUR obrigatório em empresa/fatura/BP/compromissos; sem FX; nova recusa para BP EUR com fx_rate diferente de1 |
| L3 retoma | Reopen pré-financeiro, reimportação por identidade1:1, outside protegido, revert conserva BP/baseline/histórico, outbox ordenada e finita, recibos/retry explícitos |
| L4 writers | Contexto privado PID/txid/ação/fatura/IDs; guardas Ads próprias; conversão v0 espera também UPDATE de âncora BP já iniciado; leituras sem cerco financeiro; enabled=false e mutações fechadas antes de locks; generate/revert ainda têm contenção global |
| L5 roteiros | Fixture e fotografias integrais ampliadas; efeitos/recusas/fontes/clones/transitivos, dependências reais, limites e sessões C3; mapa abaixo identifica os asserts |
| L6 instalação |35 funções derivadas de CREATE/corpo/SET/GRANT; setter normalizado `search_path=public, pg_catalog`; comparações exatas de corpo/owner/language/volatility/config/ACL, argumentos/defaults/retorno/strictness; pré-imagens e rollback guardado por dados/dependências v1 |

O candidato financeiro é `drizzle/migrations/0305_issue486_ads_invoice_generation.sql`, copiado byte a byte para `supabase/manual/0305_issue486_ads_invoice_generation.sql`; rollback é `supabase/manual/rollback_0305_issue486_ads_invoice_generation.sql`, todo comentado. `function-identities.tsv`, bloco de instalação, pós e rollback são derivados pelo programa em `verificacao-local.md`. O programa só manipula texto e executa assertions Python; não prova PostgreSQL. Não alterar um hash para encobrir um desvio de catálogo.

## Regras preservadas

O PDF é fonte. Company inclui custo sem evento; outside exclui e exige motivo. Ajuste explicitamente atribuído é integral e assinado; só o anónimo é proporcional; somas decimais exatas e resíduo determinístico. Sem cidade inequívoca conservar Master. BP por finalidade/seleção humana, sem eleger maior verba. FK forecast_id é canónica e prevalece sobre âncora. BP100/compromisso70/custos20+20 exige um único aumento10 com aceite/observação. Criação draft não concede aprovação implícita; deny individual vence inclusive platform_admin. Baseline existente é preservada e raise é auditado uma vez. Erro desfaz financeiro/BP/auditorias/operação/tarefas. Importação/plano de moeda diferente de EUR continuam possíveis, geração não; não inventar fixing nem pagamento. Fornecedor/NIF/conta têm prova forte; TikTok é vinculado ao tenant/conta/música/artista.

## Mapa critério → ficheiro → assert

Todos os ficheiros SQL abaixo estão preparados e não executados. Fixture comum: `fixture.sql`, empresas/atores/IDs486… sintéticos, sessão authenticated101 ou outro actor explicitamente indicado. `pg_temp.ads486_expect` confere SQLSTATE/mensagem e fotografia integral antes/depois, incluindo dependências, contexto, auditorias/snapshots/operação/outbox/documentos.

| Critério | Ficheiro/caso | Assert identificável |
|---|---|---|
| P1 taxa+, ajuste− explícito/anónimo, company/outside, zero/resíduo | sintetico-destinos.sql (herdado #506) | positive_fee_exact; explicit_fee_integral; negative_adjustment_exact; outside_excluded_from_proration; explicit_negative_integral; zero_media_base_denied |
| P1 Master/duas cidades/split/finalidades | sintetico-destinos.sql | master_root_cannot_refill_adoptions; only_city_shares_once; human_city_a_exact; human_city_b_exact |
| P1/P3 TikTok com prova atual | destinos C2/C3-P5-TIKTOK | campaign_id_alone_does_not_select_account; equal_total_classification_identity_*; foreign_classification_refused_* |
| P2 agregado100/70/20+20 | sintetico-financeiro.sql e parcela | one_raise_for_batch; category_after_effect; budget_baseline; canonical_N_to_1 |
| P2 duas finalidades/mãe integral e parcial | financeiro C2 | explicit_bp_identity_retained; no_largest_budget_reselection; complete_parent_counted_once; partial_parent_refused |
| P2/P3/P5 vários efeitos e aceites individuais | financeiro C3-P235-MULTI | multi_effect_fixture; individual_acceptances_retained; individual_observations_retained; recusa com digest por omitted/duplicate/extra/refused/empty/missing/foreign_field |
| P3 deny/tenant/moeda/metadados | writers C2, financeiro criação, writers C3-P5-SOURCES | deny_zero_write_*; bp_approval_required; no_implicit_fx; company_currency_in_hash; metadata_blocker_*; currency_mismatch; tenant_leak recusado |
| P4 baseline/selos/auditoria única | financeiro | single_canonical_raise_audit; approved_new_budget_with_baseline; canonical_snapshot_preserved; multi_single_raise_audit |
| P5 todas as famílias de fontes materiais | writers C2 e C3-P5-SOURCES | hash_source_change_*; isolated_hash_*; equal_pdf_total_*; fk_wins_when_anchor_removed; refusals sem efeitos após mudança de fonte |
| P5 clones com total igual | writers C3-P5-CLONES, destinos C3-P5-TIKTOK | clone_identity_bp/commitment/line; clone_totals_equal_*; equal_total_classification_identity_* |
| P5 duplicados/ref. forte/empresa/chave | financeiro C2 e multi | separators_not_collapsed; request_conflict; different_key_same_cycle_same_ids; same_key_same_ids; approval_order_stable_retry; multi_retry_no_effects |
| P6 rollback após escrita e falhas transitivas | financeiro inicial/C3-P6-TRANSITIVE | atomic_rollback_raise/audit/parent/child/link/operation/applied; atomic_create_bp/approve_bp; transitive_bp_versions/bp_version_audit_log/system_audit_log + digest integral |
| P6 ligação/tarefa documental | documentos C3-P6-DOCUMENT, actor service_role | document_transaction_documents; document_ads_invoice_generation_operation; refusal_has_no_effects |
| P7 original/proof/retoma/identidade/digest | sintetico-documentos.sql, producer real | only_mother_fiscal; one_original_one_proof; same_document_on_retry; all_tasks_required; bad_callbacks_zero_write; document_retry_no_cost/no_raise |
| P7 ordem/recibos/retry/esgotamento | documentos C2 e C3-P7-ORDER-EXHAUSTION | real_producer_order; unlock_immutable_original_resources; stable_error_receipt; exhausted_head_not_skipped; old_receipt_after_exhaustion; maintenance_conflict com fotografia |
| P7 limites inclusivos e +1 | documentos C3-P7-LIMITS; writers C3-P7-SIZE | capacity_2048_retained; maintenance_exact_byte_boundary; maintenance_capacity; generate_exact_byte_boundary; import_1000_not_truncated; import_exact_byte_boundary; plan_1000_not_truncated; plan_exact_byte_boundary |
| P8 reimport/reopen/atestação/identidade | parcela herdado/C2/C3-P8-IDENTITY | identical_preserves_exact_rows/invoice; unique_match_only; reopen_preserves_plan; source_change_unlocks_old_confirmation; ambiguity_reported_*; ambiguous_never_reuses_choice; outside recusa sem efeitos |
| P8 impedimentos independentes com FKs reais | reversao inicial/C3-P8-INDEPENDENT | blocked_reversal_atomic_*; payment_only_no_paid_blocker; dependency_changed_one_transaction; canonical_historical_recorded; canonical_seal_recorded; revert_blocked com digest |
| P8 reversão/novo ciclo | reversao | idempotent_revert; one_cycle_increment; history_retained; reversal_retains_budget; all_source_links_cleared; retry_never_regenerates_reverted |
| P9 cada corrida/desfecho | concorrencia.md e sete concorrencia-*.sql | matriz P9-CAS/KEY-SAME/KEY-DIFFERENT/LINE/CATEGORY/CREATE/TX-UPDATE/TX-DELETE/V0-MOTHER/V0-DELETE/V0-BP/CURRENCY/CLOSED/READS/CALLBACK-FIRST/REVERT-FIRST/LEGACY-LATE; PIDs/barreiras/espera e asserts distintos |
| Manifesto/ACL/cópia/pre/pós/rollback | verificacao-local.md, TSV, pre/pos, rollback-ensaio.md |35 identidades exatas; caso positivo SET separado; adulterações; rollback_has_v1_data_or_enabled; rollback_catalog_changed; RESTRICT |

Nenhum TODO/skip/stub substitui comportamento nestes roteiros. Os skips/TODO da suíte TS já existiam; nenhum teste TS foi mudado. Roteiros inertes não entram ocultamente no Vitest.

## Validação entregue e lacunas de prova

- Programa textual: PASS35 funções, cópia/pós/rollback/TSV e controlos positivos/adulterados.
- `bunx -p @typescript/native-preview tsgo -p tsconfig.app.json --noEmit`: exit0.
- `bunx vitest run`: exit0,346 ficheiros aprovados/2 ignorados;3.612 testes aprovados/6 skips/11 TODO, sem expectativas ou configuração alteradas.
- Compilação/ensaio PostgreSQL, resultados P1–P9 e rollback efetivo não foram executados; as interações com o catálogo fiel e triggers transitivos continuam por provar.
- A matriz não mede contenção global nem efetividade real dos limites internos; esses números exigem o futuro harness e não podem ser inferidos de um PASS TS.
- A preparação dos casos de corrupção histórica de âncoras que os triggers atuais já proíbem não autoriza criar controlos falsos ou desativar guardas; a reprodução fiel dessas pré-condições históricas continua dependente do ensaio próprio.
- Falhas de bytes/Storage/PDF/readback e drenagem de consumidores em voo exigem D3; o SQL só valida atestações/metadados e conserva tarefas.
- CI do PR final e criação do PR pertencem ao runner/coordenador; o executor não fez commit/push nem ligou merge automático.

## Sequência posterior

Revisão desta PR autónoma → compilação/ensaio com catálogo fiel autorizado → decisão de preparação D1. D2 produz núcleo/tipos/sugestões/testes compatíveis com o contrato; D3 integra edges/modal/import/retoma/documentos/i18n e propõe a memória definitiva. Promoção e ativação seguem PROC-promocao com SHA exato, fonte/capacidade confirmadas e Sim próprio. D1 mantém enabled=false; nenhum Publish/deploy/execução SQL é parte desta entrega. Saneamento histórico permanece noutro R2.
