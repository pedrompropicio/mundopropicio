# #333 — compatibilidade preparada, NÃO aplicada

17/10/2026. Gate inicial: HEAD local=GitHub49ededf0c482bbbcc6698a513b21f8848609bd58, status limpo, ancestralidadeexit0. Executor único agente Lovable ERP; subagente apenas leitura, sem escritor paralelo. #329 respeitada, #323 intacta. A revisão comunicou CI39054450018 success para a base; CI deste novo SHA não verificada aqui.

## Inventário completo nos fontes

- `src/pages/StandaloneInvoiceScanner.tsx` save INSERT: auth/RLS INSERT admin/platform_admin/manager/editor, empresa current_company_id; upload privado; metadados/FX/pagador/new/created_by. SELECT prévio exato; falha limpa candidato no legado atual. Patch troca lookup forte completo keyset e conserva candidato em unknown/23505; nunca reused frontend.
- `src/pages/contabilidade/AccountantStandaloneInvoicesTab.tsx` saveEdit UPDATE fornecedor/NIF/número/data/FX/pagador/total/IVA/notas. Admin ou autor na UI; policy admin/platform_admin/accountant/autor com isolamento. Patch lookup forte exclui próprio ID; 23505 mensagem segura, sem sucesso nem mudança de ficheiro.
- Mesmo ficheiro toggleProcessed UPDATE status/processed_at/by; não altera chaves. DELETE new/autor/admin e storage: fora do patch, contrato mantido. Não executado.
- `supabase/functions/ingest-standalone-invoice/index.ts`: INSERT service_role validada via isServiceRoleRequest, company existence, EUR/USD/BRL/GBP, validação assinaturas/tamanho/FX BCE existentes. Atual findExisting retorna reused antes de bytes; corrida23505 limpa e retorna falso sucesso por chave. Patch inerte retira ambos: lê documento/resolução FX antes de equivalência, paginado company+id; readback upload; compara campos/bytes; 409 conflito, unknown503 sem retry/removal. Não altera auth/FX/status/new nem permissões. Fonte atual Live NÃO editada.
- `supabase/manual/20261017_issue333_core.PENDENTE.sql`: único RPC INSERT proposto (`data_entry_commit`); guard auth.uid/current_company_id/_effective_permissions_for, manager/admin/platform_admin e sessão, recibos/auditoria. Novo core preparado no patch usa identidade forte para lookup/lock, norm ampla só valida NIF destinatário; #333 só EUR. Nunca aplicado.
- `src/lib/standalone-invoices.ts`: helpers monetários/23505, não escritor. Conservado, moedas intactas.
- Migrations `20260813020519_*`, `20260813022158_*`, `20260813023219_*`, `20260930173925_*`: DDL/grants/policies, trigger updated_at e prevent_delete_processed. Não existe nos fontes RPC/trigger ativo que mude chaves; updated_at não muda identidade. Nenhuma migration alterada.
- `_shared/storage-trash.ts`: leitura de referências, não escritor. `PartnerCurrentAccountTab.tsx` leitura. Fixtures/testes locais INSERT/UPDATE, sem operação Live. Nenhum script operacional de chave adicional encontrado no inventário repo.

Índice exato consta da prova de catálogo/fixture anterior, NÃO das migrations encontradas: não inferir estado Live só do repo. Preflight futuro deve provar definição real; nesta sessão nenhum SELECT Live.

## Entrega e provas

`patches/issue333/compatibility.PENDENTE.patch` (7 destinos), fontes identity/compat/frontend, hashes base/prepared e core preparado. Patch validado por `patch --dry-run -p1`, NÃO aplicado. Fontes ativos scanner/edição/ingest/data-entry/core anterior permanecem iguais à base; proposta global manual única editada. Sem imports ativos destes módulos excepto contrato isolado em testes normais CI.

- PostgreSQL17 real socket /tmp, listen_addresses vazio, pgcrypto real, duas ligações:36/36. Índice EXATO proposta executado local byte a byte CONCURRENTLY na tabela compatível real; #333×legado/legado×legado ambas ordens; INSERT×UPDATE/rollback; adapter real preparado com SQL + fake storage; sem rede externa. RLS legacy fixture não é prova de políticas Cloud.
- Compatibilidade26/26; handler20/20; regressões35/35 (UI13); geral1334 passam,1 skip,11 todo preexistentes, sem novos skips.
- Harness automático typecheck/build: último log17:54:47Z build OK. Erro BufferSource corrigido; nada suprimido. Não correr builds/typechecks manualmente conforme harness.
- Outputs crus em09; patch/SQL hashes abaixo. Não houve testes reais de documentos, BCE, provider/OCR/IA/email/Meta/banco nem chamadas à Cloud.

## Limitações para revisão

Política forte proposta não confunde separadores, mas não garante detectar NIF formatado/referência equivalente por fornecedor; sinal amplo NÃO identidade. Caixa ASCII/trim exterior carecem aprovação da política no rollout. Contratos prepared equivalência read-only são uma observação atual, não lock atómico contra edição/remoção posterior por outros fluxos. Nenhum resultado garante permanência futura dos bytes; divergir depois exige nova conferência, sem reverter estado legítimo.

Legacy FX/data/assinaturas existentes conservados, não ampliados/endurecidos por este patch. Equivalência conservadora exige nome/data/IVA/pagador/autor; insuficiência retorna conflito, não reused. Notas/autores diferentes conflitam mesmo com mesmo documento; revisão humana. Entrada com campos opcionais incompletos pode criar conforme legado, nunca equivalência insuficiente. Sem chave não há idempotência global para retries; resultado unknown não autoriza novo INSERT.

StorageACL real pendente. Plano futuro: fixtures fictícias em caminhos exclusivos company/session; verificar anon/owner/outrotenant e readback/hash/conflict, conferência e unknown; nada financeiro. Limpeza apenas destes caminhos com ownership/reserva atómica demonstrada e zero referências atuais, autorização explícita; se não houver prova atómica manter candidatos. Nunca check-then-delete nem cron/limpeza automática. Nenhuma prova/limpeza executada.

Issue/reserva#333 abertas; #323 dados/docs protegidos intactos. ZERO Live/DDL/DML/bucket/deploy/Publish/crons/config/segredos/OAuth/envios nesta etapa. Aplicação/ativação dependem de revisão e autorização futura separadas.