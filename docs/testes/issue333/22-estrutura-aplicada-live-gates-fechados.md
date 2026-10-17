# #333 — Prova 22: estrutura aplicada em Live, operações desligadas

17/10/2026 21:12 UTC (18:12 Fortaleza). Executor único: 0 · Cowork (ChatGPT) via Lovable ERP. Autorização de Pedro: estrutura técnica apenas; sem deploy/Publish/ativação. Issue e reserva mantidas; #323 intacta.

## Gate e fontes
Base recebida = GitHub main = 778920c0ca779a516fdb8e2265728e80acd4fea6; checkout inicial limpo. CI39068778462 completed/success informado pelo controlador; preview build desta base consultado: succeeded, in_sync=true, terminado20:56:26Z. Nenhuma nova preparação nem repetição PG73.

Preflight Live por SELECT: objetos333 e bucket ausentes; digest, helpers canónicos, tabelas e colunas reais presentes; registry oficial confirmado. Inventário de152 políticas Storage:104 PERMISSIVE, todas limitadas por igualdade de bucket;48 RESTRICTIVE não concedem acesso por si. Nenhuma referência a data-entry-staging. Baselines privados guardados antes.

## Aplicado e certificado
1. Ferramenta oficial lov_database--migration → drizzle/migrations/0190_issue333_core_v2_closed_structure.sql. Registry drizzle.__drizzle_migrations id192, created_at1792271326019, SHA256 b60f9360599f3204ce64c0eebd46350c73f07051ae3365e1dc043c14a3c1248e.
2. Mesma ferramenta → drizzle/migrations/0191_issue333_attempts_closed_structure.sql. Registry id193, created_at1792271412790, SHA256 d4c8029637361010c24d48801a0176181e7e5684706f3123436da0a04822b2e0.

Cada arquivo aplicado foi comparado com a fonte congelada por cmp (exit0) e SHA256; registro real corresponde. Nenhuma edição do SQL durante aplicação. Comentários PENDENTE originais preservados para identidade byte a byte; esta prova regista a aplicação. Nenhuma história de migrations preenchida manualmente. Types atualizados automaticamente pela ferramenta.

21 corpos de funções Live × repo conferidos por SHA256 calculado dentro da base, todos iguais. Uma resposta de prosrc ocultava ANY(allowed) como [REDACTED]; comparação por hash SQL eliminou essa ambiguidade, sem alterar a função. Inventários técnicos:56 constraints,19 índices,6 triggers. Apenas índices internos; índice global de unicidade não aplicado.

10 tabelas técnicas: RLS=true, zero policies, anon/authenticated sem privilégios de leitura/escrita. Oito tabelas têm acesso service_role previsto; duas settings sem privilégios inclusive service_role. Todas vazias: sem sessão/documento/prévia/recibo/resultado/reserva/auditoria/settings. preparation_validated e execute_validated independentes e false por omissão; nenhuma flag true em Live.

## ACL efetivas de funções
Consulta por has_function_privilege para anon/authenticated/service_role, mais ACL PUBLIC expandida:
- Todas21 funções: anon=false, PUBLIC EXECUTE=false.
- SECDEF authenticated-only: data_entry_session/add_document/note/prepare/commit/result_check/attempt_333; standalone_attempt_333/list_333.
- SECDEF service-only: data_entry_record_receipt e standalone_ingest_attempt_333.
- SECDEF sem EXECUTE externo, inclusive service: data_entry_actor/own_session/preparation_gate; standalone_attempt_gate_333/internal_333.
- Helpers não SECDEF conforme SQL exato: data_entry_norm/identity/immutable service=true e auth=false; standalone_strong_key_333 auth/service=true; standalone_attempt_guard_333 todosfalse. Não confundir esses helpers puros com gates/internals SECDEF.

## Bucket e HTTP técnico real
Storage oficial criou data-entry-staging: public=false, file_size_limit=20971520 bytes, allowed_mime_types=NULL. API de criação não expõe MIME; limitação conhecida, não configurado nem alegado. Zero novas policies;104 permissivas existentes só abrem buckets nomeados diferentes, logo anon/auth não têm acesso direto ao staging.

Uma fixture PDF técnica fictícia94 bytes, SHA256485c63c4ba50fb3abc054536bc576c397212dfc42f18207aece39b9ac75e7fd0: upload service HTTP200 e readback200 com bytes/hash iguais. Caminho exclusivo só em inventário privado. Não apagada. Nenhuma receipt/session/document/invoice associada.
HTTP anon: leitura autenticada400; URL pública400; list200 com[] (sem visibilidade). Não foram criadas sessões Auth nem desbloqueadas contas. As contas banidas e seis objetos prova17 têm baseline inalterado.

## Negativos e limites de certificação
HTTP real com credencial interna service via REST/RPC: standalone_ingest_attempt_333 para prepare/authorize/begin/commit/confirm_new_intent, cinco recusas403 / SQLSTATE42501 / mensagem gate não ativado; sem reservas/efeitos. Nenhum JWT/chave impresso ou guardado.

Executor SELECT oficial recusou executar data_entry_session e standalone_ingest_attempt_333 por ACL42501. Isto prova a restrição do executor de consulta, NÃO prova os gates dessas funções sob authenticated/service.

PENDENTE nesta certificação: quatro RPCs CORE sob contexto canónico elegível; wrappers authenticated e recuperação/conferência owner em Live. A consulta oficial é read-only e não fornece contexto SQL de identidade/role nem transação controlada; não foi contornada com DDL/helper, impersonação real, conta/sessão nova ou alteração de papéis. As identidades sintéticas existentes são editor/user, não elegíveis para CORE admin/manager. PG73 anterior cobre gates e owner-readonly na cópia real descartável, não substitui Auth/HTTP Live. Não alegar simulação SQL que não ocorreu.

## Preservação e estado
Baseline privado antes/depois idêntico nas quatro tabelas financeiras auditadas (standalone_invoices, transactions, event_forecasts, transaction_payments), helpers canónicos, políticas Storage, contas técnicas e objetos prova17. Segunda leitura após HTTP repete preservação e tabelas técnicas vazias. Sem detalhes financeiros/PII públicos.
Sem patch ativo, scanner/editor/ingest/UI/config.toml, deploy, Publish, crons, OAuth, emails, providers, índice global ou ativação. Fonte congelada permanece intacta.

HEAD após migrações observado963fa415022267836e09a1a022ecb8ffac599d21; remoto ainda778920c0 nesta leitura: autocommits próprios de aplicação, não bloqueio retroativo nem autorização para outra fase. CI da nova entrega ainda não confirmado. Não anunciar estrutura inteiramente certificada: aplicação real concluída, certificação authenticated/owner pendente.

## Próximo âmbito — NÃO executado
Revisão independente da aplicação/ACL e mecanismo autorizado para negativos CORE/owner, sem abrir gates. Implantação de código/UI/índice/teste controlado/publicação/ativação exigem autorização própria posterior. Nenhuma nova decisão financeira. #333 aberta/reservada.
