# #333 — Núcleo seguro por upload

## Resultado desta etapa

Modal “Assistente de Entrada de Dados” no Financeiro, com upload privado persistido, conversa por lote documental, prévia calculada no servidor, autorização expressa e conferência/auditoria persistentes. Primeiro efeito definitivo: Fatura Avulsa, apenas documento e metadados. Nenhum efeito financeiro de teste em Live.

Gate inicial confirmado: HEAD `c37d972053f1585e45e81ff9b70011d2a4f371a6`, ancestralidade de `150a4a13` exit 0; reserva #333 registada antes de código. #323 intacta; pedido do 10 recebido/em execução, não concluído.

## Sequência

1. Criar módulo novo e testes isolados, sem alterar endpoints legados/regras globais. Conversa dedicada por lote, persistida na orquestração técnica, sem histórico genérico de threads.
2. Guardas servidor: sessão verificada, empresa ativa, membership/papel admin/platform_admin ou manager e permissões existentes de cada ação. Leituras/retomas também fechadas; overrides negados continuam a valer.
3. Staging privado: uploads PDF/JPEG/PNG até 20 MiB, magic bytes/hash servidor, caminhos derivados no servidor, nenhum URL remoto. Não reutilizar a seleção do Scanner que dispara OCR externo automaticamente.
4. Prévia imutável/versionada: documento/hash, entidade/NIF/pagador confirmado, data civil, moeda/fixing/IVA/total, proveniência por campo, duplicados, efeitos exatos e IDs de destino. Dados insuficientes suspendem o item; nada é adivinhado.
5. “Autorizar e executar este lote”: autenticação/empresa/versão vinculadas no servidor. Revalidar documento, ERP, duplicados e permissões sob locks; alteração exige nova prévia e autorização.
6. Adapter fechado de avulsa sobre modelo/bucket canónicos: invoice + resultado + auditoria atómicos, caminho imutável/hash e reconciliação de falhas. Retoma após commit devolve resultado persistido; unknown nunca repete cegamente. Zero writes/chamadas a TX/BP/pagamentos/contas/reembolsos.
7. Conferência por item, links só para IDs efetivamente persistidos; identidade real do aprovador e data servidor na observação obrigatória. Pagador não é autorizador.
8. Modal com header fixo/scroll/safe area; desktop painéis, mobile separadores. Empresa/evento visíveis; troca de empresa invalida contexto e cancela pedidos obsoletos.
9. Testar persistência num PostgreSQL descartável local, storage/provider/FX isolados e egress negado; só depois aplicar migração aditiva própria/deploy de endpoints novos. Verificar catálogos/ACL/RLS/corpos Live sem fixtures financeiras.
10. Provas/docs próprios, QUADRO e roadmap; Issue/reserva abertas para verificação e próximas integrações. Sem Publish.

## Operações e dependências

| Operação | Adapter / permissão | Estado nesta etapa |
|---|---|---|
| Upload/conversa/prévia | Endpoints técnicos novos; sessão/papel/empresa | Implementar |
| Avulsa | Commit fechado aditivo; policies atuais de avulsa | Habilitar só após prova isolada |
| OpenAI | Gateway Responses/SDK servidor, schemas estritos | Preparar; fail-closed até configuração/prova, sem teste cobrado |
| TX/anexo/grupo | Fluxos canónicos; manage_transactions | Bloqueado até atomicidade/hash/retoma validados |
| BP/Formalidade | Versão ativa/log; manage_bp | Bloqueado até adapter específico |
| Aprovar/elevar verba | approve_transactions_atomic; approve_transactions/raise_budget | Bloqueado |
| Pagamento efetuado | Fluxos canónicos de pagamentos/conta | Bloqueado até commit idempotente validado |
| Fornecedor novo | NIF/IBAN; manage_suppliers | Bloqueado; só pesquisa/confirmar |
| Conciliação/extratos | RPCs banco; manage_bank_reconciliation | Indisponível |
| Bilheteiras | confirm_ticket_office_statement/save_ticket_office_settlement | Indisponível |
| Gmail/Drive/OAuth | Ligação própria futura | Indisponível; não iniciar OAuth |

## Detalhes técnicos

- Ficheiros novos em `src/components/data-entry/`, `src/lib/data-entry/`; import lazy em `src/pages/Transactions.tsx`. AI Elements para conversa quando a integração estiver validada; nunca mock de resposta/execução.
- Endpoints propostos: `data-entry-session`, `data-entry-document`, `data-entry-preview`, `data-entry-execute`. Lista fechada/versionada de comandos com schemas strict, não SQL/RPC/URL arbitrários nem gateway livre de service_role.
- Tabelas técnicas próprias para sessions/documents/messages/previews/items/authorizations/audit/config; grants explícitos/RLS/immutability/uniqueness/locks. Bucket técnico privado novo pelo API próprio; upload/download controlados servidor.
- `auth.getUser` explícito; usar contrato canónico de permissões/empresa. `callerRole` não filtrado em `_shared/multiTenant.ts` e `canAccessCompany` de `_shared/caller-context.ts` não bastam: guard próprio fail-closed sem editar helpers globais.
- `ingest-standalone-invoice` continua service_role-only e intocado; seu reused não confere bytes/valores e upload+insert separados não provam retoma. Adapter novo fechado reutiliza modelo e validações, não expõe credencial.
- `ingest-transaction-document` continua intocado: nome+tamanho não é hash, expansão/agrupamento têm efeitos adicionais e commit separado. Essa operação fica bloqueada nesta entrega até adapter específico comprovado.
- Câmbio usa `_shared/fx-rate.ts` na data da fatura e congela fonte/data/taxa na prévia; falha não tem fallback inventado. Datas YYYY-MM-DD validadas como dia civil.
- OpenAI proposto pelo Gateway Responses, default documentado `openai/gpt-6-astra`, SDK servidor/stream/store:false/strict schemas. LOVABLE_API_KEY gerida listada, mas modelo/configuração do módulo não verificados. Não migrar providers existentes nem chamar AI/OCR cobrados em testes.
- Observação: “Feito por LLM com autorização de [nome do utilizador] em [data].” ID/nome real/timestamp servidor, marca uma vez e notas conservadas.
- SECDEF internas: revoke PUBLIC/anon/authenticated, grant service_role; RPCs de sessão apenas quando auth/tenant verificados; provar has_function_privilege e repo×Live. Backup derivado sem listas manuais; somas/paginação canónicas.

## Contratos reais e provas

Plano completo/matriz/ficheiros auditados: `docs/features/assistente-entrada-dados-333.md`.
Gate e catálogo Live (23 colunas, índice único e dois triggers de avulsa; bucket privado): `docs/testes/issue333/01-gate-e-contratos.md`.

Bases: memórias standalone-invoices/invoice-groups/duplicados/Formalidade/aprovação/conciliação/bilheteiras; AuthContext/permissions/useCompany; ingest endpoints; storage/image-upload/invoice-ocr-prepare; Transactions; approve-rpc; pagamentos; admin-window; migrations canónicas. `transactions.forecast_id` prevalece sobre a memória antiga que nega a coluna.

## Aceitação e limites

Fixtures locais reais, sem rede/triggers financeiros: auth/tenant/overrides; zero efeito sem aprovação; preview/documento/ERP alterados; injeção/magicbytes/hash/path; avulsa sem contabilidade; duplicados/grupo/Formalidade protegidos; dupla sessão/crash/timeout após commit/parcial/unknown; nome servidor/dia civil/troca empresa/configuração ausente/integrações bloqueadas.

Vitest baseline/depois e testes relevantes; typecheck/build pelo harness automático, provas versionadas e CI final independente. Não repetir suites de #322/#332. Nenhum documento real, lançamento financeiro, email, banco, Meta, OAuth, cron ou Publish. Declaração de disponibilidade só após persistência/conferência verificadas; caso contrário reportar bloqueio concreto, nunca sucesso simulado.