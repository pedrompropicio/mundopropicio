# #333 — sete destinos validados em cópia isolada, NÃO aplicados à aplicação principal

17/10/2026. Executor único 0-Cowork/Agente Lovable ERP, sem subagentes. Gate inicial: HEAD local=GitHub `12dd324ea4c7ee2d9f1d3e61543a2d06cf8633e8`, checkout limpo, ancestralidade exit0. CI39056086173 success é informação da revisão independente do Pedro; não leitura nova da API CI nesta execução. Reservas #333 mantida e #323 integralmente preservada.

## Origem/destinos efetivamente executados

`git archive` da base para `/tmp/issue333-integrated/tree`, excluindo `.env*`, `.github`/deployhooks e Git. Pacotes instalados reutilizados por link `node_modules`, sem copiar credenciais ou instalar. Processos com ambiente limpo por allowlist (PATH/HOME/TMPDIR/NODE_ENV/CI), nunca envprod. Na suíte geral: URL `http://127.0.0.1:9` e texto fictício de chave; fetch bloqueado pelo setup adicional isolado. Nenhuma chamada Cloud/Auth/BCE real. Patch aplicado por `patch --batch -p1`, não apenas dry-run. Base7/prepared7 hashes verificados antes/depois; nenhum reject.

Sete destinos REAIS no isolado:
- `supabase/functions/_shared/standalone-identity.ts`
- `supabase/functions/_shared/standalone-compat.ts`
- `src/lib/standalone-identity-lookup.ts`
- `src/pages/StandaloneInvoiceScanner.tsx`
- `src/pages/contabilidade/AccountantStandaloneInvoicesTab.tsx`
- `supabase/functions/ingest-standalone-invoice/index.ts`
- `supabase/manual/20261017_issue333_core.PENDENTE.sql`

UI importa scanner/editor/lookup nesses destinos, não patches. Endpoint executa `Deno.serve` do `index.ts` real patchado capturado no teste; createClient/FX/download/storage fakes. `isServiceRoleRequest` REAL preservado: token ausente/normal401, claim service com Auth fake403 → endpoint401; envkey fictícia aceita. Isso NÃO prova verify_jwt/middleware Cloud. Editor preserva regras UI admin/autor; PostgreSQL ACL de fixture NÃO prova políticas Cloud. Todas as moedas legadas permanecem; #333 só EUR.

PostgreSQL: `beforeAll` aplica byte a byte o core REAL patchado completo; índice proposto EXATO `CONCURRENTLY` fora de transação. Fixtures compatíveis/pgcrypto/PostgreSQL17, socket Unix/listen_addresses vazio, duas conexões. Imports do adapter nesse run apontam para shared REAL patchado. Não há substituição por `patches/issue333/compat.ts`. O runner main separado continua teste de helpers/proposta inerte, não prova integrada.

## Resultado final observado

- tsgo completo `tsconfig.app.json` exit0; aliases @shared e assinaturas dos componentes compilados.
- Vite build real com configuração original, exit0 (343 precache entries); avisos de chunks >500k preexistentes, sem relaxar limiares. Sem deployhooks.
- Deno2.6.10 `check --no-remote`: index ingest e shared transitivos exit0. Import map APENAS isolado aponta npm imports para `.d.ts` dos pacotes locais reais (`@supabase`2.99.2, Zod instalado), sem rede. Não prova versão exata npm2/Zod3.23.8 resolvida em runtime Cloud nem deploy; pendente comparar lock/resolução antes de aplicação. Não alegar que tsconfig.app cobre Deno.
- Integrados29/29 (endpoint22 + UI7), com documentos fictícios existentes completos.
- PostgreSQL36/36, pgcrypto/duas conexões; novo×legado/legado×legado ambas ordens, INSERT×UPDATE, rollback23505, auditoria/bytes desconhecidos preservados.
- Handler #33320/20 sobre destinos originais integrados; nenhum recurso ativado.
- Suíte geral integrada1334 passam,1 skip/11todo preexistentes; nenhuma adição de skip. Última execução com fetch externo bloqueado.
- Harness da árvore principal: build OK observado18:18:23UTC; NÃO substitui as provas isoladas acima.

Outputs integrais/commands/exits em11; manifesto em `patches/issue333/base-sha256.txt`. Primeira rodada integrada falhou por setup globals/Blob jsdom e falha REAL de setWritePending omitido no gerador; corrigida e repetida29/29. Primeira suíte geral sem URL fictícia falhou14 suites por client config; ambiente fictício corrigido, sem config ERP alterada. Rodada PG inicial atingiu timeout depois de expectativa antiga destrutiva (`" - "` ≠ `"-"`): corrigida para caixa ASCII equivalente, sem ampliar identidade. Run final36/36; servidor órfão local interrompido, nunca storage removido.

## Correção frontend e limites — não exatamente-um global

Scanner reserva antes do upload em sessionStorage por user+empresa; erro/unknown conserva objeto e bloqueia save/retake/captura, inclusive remount. Edits reservam user+empresa+ID antes de UPDATE, bloqueiam repetição após unknown. Dup preflight não escreve; próprioID excluído; paginação201 provada. Depois de falha não há sucesso simulado, cleanup, retry automático ou desbloqueio automático. Criativo/ficheiro não apagado.

IMPORTANTE: sessionStorage é trava UX local, NÃO claim atómico servidor/global. Nova tab/browser/dispositivo, limpeza de storage e chamadas diretas podem repetir chaves incompletas. No endpoint, pedido explicitamente novo com chave incompleta também pode duplicar; o teste prova apenas que o handler NÃO repete automaticamente. Não há conferência/retoma legada persistente suficiente para desbloquear scanner. Candidato privado mantido, reconciliação humana necessária; ativação CONTINUA BLOQUEADA por essa lacuna e StorageACL. Não é licença para aplicar índice/compatibilidade.

## Hashes finais

Patch: `316d9e0ffa9ccd6dd46648d3b9220587c3eeb44df1c8df3104952c37b533bd5c`.
Core preparado: `9f8baeea0a19931c6b591aaf8f65d2429845bacd0c2a66004ef24b0501d8c3ef`.
Índice proposto: `e6d85d294eefb9b764a2a1cb81469398f43e3c8cc7cf6900ead3acbe52cf39ab`.

A árvore principal mantém scanner/editor/ingest/core iguais aos hashesBASE. Só patch/gerador/testes/provas/docs próprios voltaram ao repo. ZERO Live/SELECTLive/DDL/DML/bucket/deploy/Publish/crons/config/segredos/OAuth/providers/OCR/IA/Meta/email/banco. Nenhum push/commit na cópia; metadados main são geridos pelo harness. SHA final/CI novo dependem da propagação, não inferidos da CIbase.
