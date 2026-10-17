# #333 — correção de integridade, readback e retoma

17/10/2026 · executor único 0 Cowork (ChatGPT), agente Lovable ERP. Para revisão independente, NÃO conclusão da Issue.

## Gate #329 e coordenação

Arranque: checkout Lovable = GitHub main `7d474d0ade54fda0a5a970b24ba6ab1bc439ff35`; ancestralidade exit0, checkout limpo. INDEX/QUADRO/estado/AGENTS/memória lidos; reserva própria atualizada antes do código. Nenhum segundo escritor/subagente. Sem reset/rebase/forcepush. #323 preservada (CHATS/DECISIONS/procedimentos/prompts10, escritores legados, fornecedores e lote financeiro intocados).

SHA técnico observado após testes: `ec13c9c601ef504034483a659f65afec7bc1592b`; 7d474d0 ancestral exit0. Nesse instante GitHub ainda no ancestral, sem commits exclusivos do remoto; sincronização final/CI aguardam propagação automática. Não inventar SHA de documentação futura.

## Correções

1. Handler sem capacidade remove: recusa SQL definitiva e unknown conservam candidato privado. Nenhum check-then-delete/cron. Recusa é `por_confirmar`, nunca sucesso de lançamento. Barreira determinística P1 suspenso/P2 nova prévia+COMMIT/P1 40001 ou 08006: handler + PostgreSQL real preservam bytes e exatamente 1 avulsa/1 auditoria. Estado final comprovado por check SQL+storage fake.
2. `putVerified` relê bytes tanto em upload200 como conflito, compara tamanho/SHA256 antes de receipt. Ausente/corrompido no staging ou final: zero recibo correspondente/commit.
3. Ação `check` tipada somente leitura, session+tenant+owner guardados; sem authorize e sem commit. SQL sem resultado devolve NULL/por_confirmar. UI cache apenas localiza preview para check; mostra por confirmar enquanto verifica e conferência pendente/repetir conferência na falha. Resultado incerto bloqueia novas execuções; marcador de incerteza salvo antes do pedido e separado por utilizador/empresa/lote.
4. UI remonta/limpa em fecho, utilizador, resolução auth e evento canónico de troca de empresa. Generation descarta load/upload/preview/execute antigos; nenhuma continuação de upload/preview faz segunda chamada após descarte. Requests levam expectativas user/company verificadas no servidor; status canónico revalidado antes de execute. Isto não afirma rollback por abort: a execução não é abortada como prova de segurança e a retoma é só check.
5. Toda edição invalida `previewValid` + confirmação. Comparação dos campos atuais com snapshot bloqueia executar até nova prévia. Retoma repõe dados sem checkbox. Origem apresentada como confirmada pelo utilizador; SQL continua `confirmed_by_user`.
6. `result_check` compara fornecedor, nome ficheiro, NIF/número/data/total/IVA/pagador, notas exatas+marca, empresa/autor/referências, EUR/FX NULL, snapshot SHA256 e receipt/documento. Notas preservam espaços. Estado legítimo `processed` é retornado como atual separado do original `new`, sem reverter/false new. Uma mutação por campo foi testada transacionalmente e detetada.
7. Índice global só em proposta separada, não aplicado. Levantamento SELECT agregado: 0 grupos de conflito, 32 chaves incompletas; sem dados pessoais no repo. Testes da expressão só em tabela fictícia separada; índice canónico e teste de limitação legada preservados. Upload false hardcoded; nenhuma env pode ativá-lo nesta entrega.

## Provas executadas

- Baseline pertinente: 26/26 (UI4, contratos8, avulsas4, duplicados6, guard4).
- Após correção: pertinente35/35 (UI13 + restantes22).
- Handler fake/egress fechado: 20/20.
- PostgreSQL real descartável, pgcrypto, duas ligações, socket Unix sem TCP: 27/27 (inclui handler+SQL corrida, rollback, resposta perdida, estados atuais, proposta normalizada e NULLs).
- Suite geral: 164 ficheiros passam, 1 skipped preexistente; 1308 passam, 1 skipped preexistente, 11 todo. Sem suprimir testes.
- Harness automático: build OK 17:31:00, 17:31:50, 17:33:54 UTC. Falha inicial de tipos Promise<unknown> em mocks corrigida com tipos explícitos, sem skip. Não foram corridos build/typecheck manualmente.
- CI anterior 7d474d0: success comunicado pela revisão do Pedro; CI SHA novo e canário runtime não confirmados nesta sessão (não chamar endpoint externo de teste). Logs integrais em `07-outputs-locais.md`.

## Zero efeitos Live e limites

Única consulta Live foi SELECT agregada de conflitos/catálogo: sessions ausente, commit RPC ausente, staging buckets0. Zero DDL/DML/migração/deploy/bucket/configuração/Publish/crons/OAuth/provider/IA/OCR/FX/banco/email/Meta/documento real. Storage falso NÃO prova ACL, consistência ou egress real do Lovable Cloud. Nenhum percurso de upload real foi ativado/testado em produção; UI comprovada apenas pelo adapter local, handler pelo fake e SQL descartável.

Bloqueios: autorização/revisão da proposta global e adaptação coordenada dos escritores legados; storage real/ACL; migração/bucket/deploy apenas após autorização futura; CI/sincronização final independente; IA/Gmail/Drive/outras moedas e adapters financeiros pendentes. Issue e reserva #333 mantidas, #323 intocada.

SQL core SHA256 `4eeff2dfcf487f9ea211a0434d18a4a062c69e2a666744aa4954537ce592f8a3`.
Proposta índice SHA256 `b9f2edc5c28e45a74d68b7f78df8da686834626b5695a823da2ba267793d43f4`.
Referência inexistente `04-postgres-real-duas-conexoes.md` corrigida para `04-retoma-postgres-real-e-ui.md` no SQL inerte.