# #333 — Assistente de Entrada de Dados: plano técnico e dependências

Estado: núcleo local por upload/UI implementado e corrigido; indisponível em Live. Provas atuais: `docs/testes/issue333/05-correcao-integridade-retoma.md` e `06-proposta-unicidade-normalizada.md`. Nenhuma migração/bucket/deploy/Publish. Upload hardcoded false; execute sem configuração. Ativação bloqueada por unicidade normalizada legada e storage real. Issue/reserva abertas. Executor único: 0 · Cowork (ChatGPT), agente Lovable ERP; #323 intacta.

Continuação autorizada 17/10/2026 17:46UTC: compatibilidade dos fluxos antigos preparada exclusivamente em `patches/issue333/compatibility.PENDENTE.patch`, NÃO aplicada. Inventário/provas08/09; política forte proposta trim SPACE exterior/caixa ASCII preserva separadores/prefixos/zeros, sinal amplo só revisão. 23505 sem falso reused; equivalência exige metadados/bytes, unknown sem remoção/retry. PostgreSQL36/compat26/handler20/UI13/geral1334. Nenhum escritor Live alterado; revisão/autorizações de aplicação e storage real pendentes.

## Sincronização e âmbito

- HEAD inicial real: `c37d972053f1585e45e81ff9b70011d2a4f371a6`.
- `git merge-base --is-ancestor 150a4a13f3f00cb46fff4820d5e3330708865c4e HEAD`: exit 0; checkout inicialmente limpo.
- Reserva #333 registada antes de código em `docs/QUADRO.md`; pedido do 10 recebido/em execução, não concluído. #323 preservada integralmente.
- Só módulo técnico novo, ponto de abertura lazy no Financeiro, testes/docs próprios. Sem alterar endpoints legados, permissões globais, dados de #323, CHATS, DECISIONS, procedimentos/prompts, portais/CAPI/Meta/Newgang.
- Sem Publish, crons, OAuth, rotação/configuração de providers, emails, pagamentos bancários ou documentos reais em testes.

## Contratos auditados

- `.lovable/memory/features/standalone-invoices.md`: avulsa exclusivamente documento/metadados; nunca TX/BP/conta/lista/reembolso.
- `.lovable/memory/features/invoice-groups.md`, `transaction-duplicate-warning.md`, `bp-formalidade.md`, `approve-transactions-permission.md`, `conciliacao-bancaria.md`, `ticket-office-statements.md`.
- `supabase/functions/ingest-standalone-invoice/index.ts`: apenas service_role; dedupe exato empresa/NIF/número; upload e insert separados; limpeza pelo trash; sem comparação binária/valores no resultado reused. Não chamar do browser nem usar reused como prova de documento completo.
- `supabase/functions/ingest-transaction-document/index.ts`: apenas service_role; alvo expande grupo; pode atribuir grupo por fornecedor/ref; idempotência nome+tamanho, não hash; agrupamento depois dos inserts, sem atomicidade total. Adapter do assistente permanece bloqueado até prova segura de efeitos/retoma.
- `src/pages/StandaloneInvoiceScanner.tsx`, `src/lib/image-upload.ts`, `invoice-ocr-prepare.ts`, `storage.ts`, `standalone-invoices.ts`: reutilizar preparação local quando segura; não reutilizar seleção que chama automaticamente `extract-camarim-receipt`.
- `supabase/functions/_shared/fx-rate.ts`: BCE na data da fatura/último fixing anterior; sem fallback histórico. Resolver antes da prévia e congelar fonte/data/taxa. Falha bloqueia moeda estrangeira, não substitui por taxa inventada.
- `src/contexts/AuthContext.tsx`, `src/lib/permissions.ts`, `src/hooks/useCompany.ts`: permissões por empresa ativa e overrides; evento `onActiveCompanyChanged` invalida UI/requests.
- `supabase/functions/_shared/multiTenant.ts`, `_shared/caller-context.ts`: getUser explícito é confiável; callerRole não filtrado por empresa e canAccessCompany permissivo não bastam para #333. Novo guard fechado, usando identidade verificada + empresa ativa + papéis nessa empresa + permissões canónicas, com erros de leitura fail-closed.
- `src/pages/Transactions.tsx`: abertura nova lazy/Suspense; não refatorar restantes modais/fluxos.
- `src/lib/transaction-duplicate-check.ts`, `invoice-group.ts`, `admin-window.ts`; `supabase/functions/approve-transaction/index.ts`, `approve-rpc.ts`; `src/components/TransactionPaymentModal.tsx`, `BatchPaymentModal.tsx`.
- `transactions.forecast_id` é canónico; trecho que o nega em `transactions-bp-linkage.md` está obsoleto. Fonte atual: `20260923165107_2cf8dcd7-7fbd-4e97-ae49-f2785c03fb07.sql`. Não corrigir memória histórica de outra frente nesta etapa.
- Bilheteiras: `TicketOfficeStatementsPanel.tsx`, `TicketOfficeStatementDocuments.tsx`, `ticket-office-statement-documents.ts`, `TicketOfficeSettlementModal.tsx`, `20261010213100_0091_derp_296_save_ticket_office_settlement.sql`; apuramento nunca é fecho de sócios e retido já inclui posição.

## Matriz operação → adapter → autorização → estado pretendido nesta etapa

| Operação | Adapter | Autoridade existente a verificar | Estado |
|---|---|---|---|
| Upload/conversa documental | Novos endpoints técnicos #333 | Sessão, admin/platform_admin ou manager, empresa ativa | Implementar staging; sem efeito financeiro |
| Extrair/propor | OpenAI via Lovable AI Gateway, Responses/SDK servidor | Mesmo guard; configuração/validação explícita | Preparar; manter indisponível até configuração e prova, sem teste cobrado |
| Registar avulsa | Adapter novo fechado sobre tabela/bucket canónicos, sem alterar ingest legado | Papéis e policy de INSERT avulsa atuais; pagador da empresa confirmado | Primeiro efeito definitivo, apenas após commit/retoma isolados validados |
| Anexar a TX existente/grupo | Contrato ingest-transaction-document auditado; commit fechado próprio necessário | manage_transactions + papéis/policies de anexo; todos os destinos/selos/grupos | Bloqueado até atomicidade/hash/efeitos validados |
| Criar TX | Fluxo TransactionFormModal/regras canónicas | manage_transactions, D1, evento/janela, BP | Bloqueado: não há adapter genérico atómico já validado |
| Criar BP / Formalidade | Fluxo BP ativo/log canónico | manage_bp; versão ativa; confirmação própria | Bloqueado até adapter específico |
| Aprovar/elevar verba | approve-transaction → approve_transactions_atomic | approve_transactions; raise_budget separado | Bloqueado nesta etapa |
| Registar pagamento já efetuado | TransactionPaymentModal/BatchPaymentModal | Permissões/policies reais de pagamento/conta; não inferir de manage_accounts | Bloqueado até claim e commit canónicos validados |
| Entidade nova | Fluxo fornecedor/NIF/IBAN | manage_suppliers | Bloqueado nesta etapa; pesquisar/confirmar entidade sem criar |
| Extratos/conciliação | parse-santander, reconcile_bank_line, launch_from_bank_lines | manage_bank_reconciliation + conta/tenant | Indisponível nesta etapa |
| Apuramentos/fechos bilheteira | confirm_ticket_office_statement / save_ticket_office_settlement | manage_ticket_offices + regras RPC/selos | Indisponível nesta etapa |
| Gmail/Drive | Ligação própria futura; nenhum conector pessoal | OAuth/escopos/configuração futura | Indisponível; nenhum OAuth iniciado |

## Arquitetura técnica proposta

1. Novos ficheiros em `src/components/data-entry/` e `src/lib/data-entry/`, sem reescrever contabilidade. Conversa por lote documental, persistida nas tabelas técnicas, sem sidebar de threads genérico; cada lote tem identidade estável e só pode executar na mesma empresa. AI Elements segundo contrato do chat; enquanto análise não validada, estado indisponível real, não resposta simulada.
2. Novos endpoints `data-entry-session`, `data-entry-document`, `data-entry-preview`, `data-entry-execute`, com schemas Zod strict e comandos enumerados; nenhuma seleção arbitrária de tabela/RPC/URL/provider. CORS SDK; POST autentica com auth.getUser. Leitura/retoma também verifica empresa ativa e ownership. Nenhum segredo/prompts internos no retorno/log.
3. Migração aditiva própria #333: tabelas técnicas sessions/documents/messages/previews/items/authorizations/audit/config; UUIDs, FKs públicas, empresa/owner, unicidade por lote/item/versão/documento/operação. Grants explícitos, RLS fechado e índices. Nada escreve nas tabelas canónicas sem execução autorizada. Imutabilidade de previews e autorizações no servidor; configurações não editáveis pelo modelo/cliente.
4. Bucket privado técnico novo, criado pelo API próprio, sem SQL em storage.buckets; upload só servidor, sem INSERT/UPDATE browser. Guardas de download específicas ao lote/tenant, caminhos derivados de IDs servidor. Limite 20 MiB PDF/JPEG/PNG, validar assinatura completa e tipo declarado; rejeitar vazio, HTML, path traversal e origem remota. Hash SHA256 dos bytes recebido/calculado servidor. Original e derivado local distinguidos por hashes; não trocar bytes autorizados.
5. Prévia canónica servidor: versão/schema/hash, empresa, documentos/hash/tamanho, ação tipada, args normalizados, fornecedor/NIF/cliente/pagador, data civil validada, moeda/fixing/IVA/total, notas/efeitos, destinos prealocados, origem por campo, dados/versões ERP e duplicados. Sem dados suficientes: aguarda escolha, não inventar defaults financeiros.
6. Autorização exclusivamente pelo comando explícito “Autorizar e executar este lote”, sobre ID/versão prévia. Servidor relê snapshot e resolve aprovador/nome/empresa; cliente não entrega hash ou JSON como aprovação. Lock empresa/sessão/preview/item com ordem fixa e revalidação atual; mudança → prévia nova, autorização antiga recusada.
7. Avulsa: não usar endpoint legado como gateway. Adapter restrito reutiliza modelo/policies/validações atuais com commit fechado que grava invoice + resultado + auditoria em uma transação. Ficheiro final em caminho determinístico e imutável, checksum conferido antes de commit. Interrupção após cópia mas antes de commit reconcilia objeto pelo hash; após commit devolve resultado persistido. Estado unknown nunca repete insert/cópia cega. Colisão com fatura externa exige comparação completa e prova do ficheiro; divergência bloqueia. Sem referência/NIF/pagador confirmado não habilitar execução automática.
8. Primeiro adapter não chama OCR, email, download Google nem alteração de TX/grupo. Não adiciona triggers financeiros. Após commit relê todos os campos e objeto/hash pelo guard e mostra link só para ID comprovado, em `/scanner-faturas`/conferência canónica; se não existir deep link de detalhe, não prometer abrir um registo individual.
9. Auditoria atómica com ID/nome real de profiles, timestamp servidor e data Europe/Lisbon: “Feito por LLM com autorização de [nome do utilizador] em [data].” Conservar notas existentes e aplicar marca uma vez. Pagador não é autorizador.
10. Modal: header fixo + body scroll + safe area/pilha existentes. Desktop três painéis, mobile separadores Conversa/Documentos/Prévia/Execução. Empresa/evento visíveis; troca empresa encerra contexto e cancela requests obsoletos. Botões de operações bloqueadas não executam no-op/sucesso fictício.

## OpenAI e dependências

- Listagem de nomes de configuração confirmou LOVABLE_API_KEY gerida; OPENAI_API_KEY não consta. Isto não verifica disponibilidade do modelo. Não criar/rodar chaves, não alterar integrações de outras frentes.
- Nova integração OpenAI proposta via Gateway Responses com SDK servidor, modelo default documentado `openai/gpt-6-astra`; preservar providers existentes. Sem chamada cobrada nesta etapa de plano. Configuração do módulo inicialmente fail-closed; não fallback silencioso para Gemini/OCR existente.
- Schemas root object, todas propriedades required, opcionais nullable e additionalProperties:false; stream, store:false e opções reasoning/headers segundo referências oficiais da plataforma. Modelo só propõe; executor é separado e não tem ferramentas do modelo.
- Antes da implementação AI ler exemplos/helpers obrigatórios e composição/transport AI Elements. Prova da integração ficará explicitamente pendente se não for possível testar sem chamadas cobradas autorizadas.

## Validação e entrega

- Fixtures fictícias em PostgreSQL local descartável, sem credenciais Live, sem triggers de negócio/rede. Storage/provider/FX isolados com egress negado. Testar persistência real e duas conexões concorrentes, não apenas mocks.
- Casos obrigatórios: anon/sessão falsa/role errado/tenant diferente; manager com override negado; zero efeito sem aprovação; snapshot/documento/ERP alterados; injeção; MIME/hash/path; avulsa zero chamadas às tabelas financeiras proibidas; duplicado completo/divergente; TX/grupo/Formalidade bloqueados sem writes; dupla sessão, timeout após commit, parcial/unknown; nome servidor/dia civil; troca empresa; configuração ausente; integrações bloqueadas.
- Para cada operação suportada: prova de rollback/crash e conferência do resultado persistido. Operações não validadas permanecem indisponíveis.
- Baseline e testes posteriores relevantes com Vitest; harness verifica typecheck/build automaticamente (não correr builds manualmente). Provas versionadas em `docs/testes/issue333/`, com falhas existentes e limites explícitos. CI do SHA final verificada independentemente.
- Só aplicar migração/deploy novos após testes isolados; SQL do ficheiro enviado byte a byte/hash. SELECT Live de catálogo/ACL/RLS/bucket/corpos, nenhuma fixture financeira em Live. SECDEF revoga PUBLIC/anon/authenticated; internas service_role apenas; RPCs de sessão explicitamente autenticadas e tenant-bound. Verificar has_function_privilege.
- Fecho próprio no QUADRO, feature memory, roadmap e estado financeiro apenas diff da #333, sem disputar #323. Issue e reserva ficam aguardando verificação/integrações. Reportar SHA real e integração/receção quando disponível, nunca presumir commit futuro. Publish necessário para UI, não executar.

## Bloqueios concretos encontrados (histórico da primeira proposta)

### Auditoria da proposta executável — 17/10/2026 16:44 UTC

Ficheiros preparados: `supabase/functions/data-entry/core.ts`, `index.ts` (RELEASE upload/execute/analysis=false), `supabase/manual/20261017_issue333_core.PENDENTE.sql` (NÃO aplicar), contratos Vitest e prova PostgreSQL embebida em `docs/testes/issue333/`.

Bloqueios que impedem disponibilidade segura nesta entrega:
- Guard SQL usa coalesce do perfil, não a resolução canónica completa da empresa ativa; necessita resolução/lock compatível e prova de overrides negados. Papel por si só não prova permissões de cada ação.
- Lock cooperativo de #333 não cobre inserts concorrentes legados. Índice canónico e normalização/NIF/ref devem proteger o mesmo domínio sem alterar o modelo global ou os componentes/dados reservados de #323. Não habilitar por inferência.
- Proposta SQL aceita FX declarado e tipos JSON insuficientemente estritos; endpoint limita a EUR, mas a função proposta também precisa de bloquear moeda externa até fixing canónico congelado e comprovado.
- Magic bytes identificam formato, mas não provam integridade/parser de PDF/imagem completo; prévias não podem aceitar assinatura truncada.
- PostgreSQL embebido prova transação/retoma sequencial e pedidos em fila, NÃO duas conexões independentes. Usa fixtures fictícias, índice de fixture, digest substituto e nenhuma trigger canónica/rede. Não prova crash de storage, corrida com legado, rollback injetado após insert ou ausência de efeitos de triggers reais.

Decisão técnica de segurança: nenhuma migração aplicada, bucket criado, endpoint deployado, configuração ativada ou UI de sucesso/mock adicionada. Execução desativada no endpoint e por configuração ausente no SQL. Não alterar #323 para contornar bloqueios; revisão de contratos dessa superfície é dependência de coordenação. Provas/limites: `docs/testes/issue333/02-nucleo-isolado-e-bloqueios.md`. Publish só após núcleo validado; NÃO executar agora.

- Legacy ingest de anexos não tem idempotência por conteúdo nem commit grupo+linhas atómico; não habilitar esse efeito por wrapper.
- Legacy ingest de avulsa não vincula aprovação/resultado/auditoria na mesma transação e pode reutilizar documento divergente; precisa adapter fechado aditivo, sem alterar legado.
- OCR da seleção atual gera chamada externa automática; não reutilizar seleção do Scanner para análise #333.
- Conveniência callerRole/tenant dos helpers não satisfaz isolamento estrito; criar guard próprio fail-closed sem editar helpers globais.
- Configuração e teste real de OpenAI não verificados; nenhum teste cobrado permitido pelo pedido.
- Integrações financeiras e externas seguintes ainda sem adapters específicos validados. Não constituem entrega concluída.