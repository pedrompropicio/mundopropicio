# #333 — Retoma técnica: CI, guardas canónicas, PostgreSQL real e UI

17/10/2026 17:15 UTC · executor Lovable ERP pelo 0 · Cowork (ChatGPT). Base 0707f2a9 (ancestral confirmado). #323 intacta.
NÃO concluída: nada aplicado em Live (sem migração, bucket, deploy, Publish, dados financeiros).

## Entregue
- CI: `[functions.data-entry] verify_jwt = true` em `supabase/config.toml` (sem allowlist, sem deploy).
- SQL `supabase/manual/20261017_issue333_core.PENDENTE.sql` (sha256 0770d4c1…aedaee): sem `p_user`; identidade por `auth.uid()`, empresa por `current_company_id()`, papel por `_effective_permissions_for` (helpers canónicos inalterados). Só admin/platform_admin/manager (editor fica fora). Tabelas técnicas fechadas a anon/authenticated; RPC de sessão só authenticated; `data_entry_record_receipt` só service_role; `data_entry_actor` sem grants.
- Recibos de armazenamento: documento e cópia final só contam se o servidor gravou e conferiu os bytes (SHA-256). Caminho de staging determinístico por bytes; retoma não duplica.
- Fronteira HTTP (zod strict) e SQL: chaves exatas, tipos escalares, cêntimos, data civil real, só EUR, pagador membro, NIF destinatário = empresa.
- Documento: PDF (cabeçalho, objeto, startxref/%%EOF), PNG (chunks + CRC + IEND), JPEG (segmentos, SOF, SOS, EOI). Leitura com limite em stream, sem exigir Content-Length.
- Handler injetável (`handler.ts`): erros internos nunca expostos; só mensagens "#333:" do SQL.
- Execução: hash da prévia + versão atual + recibo final + ERP revalidados; resultado e auditoria na mesma transação; conferência compara a avulsa persistida com a prévia. Fechada por `data_entry_settings` (sem linha).
- UI: botão "Assistente" em Transações (admin/manager), modal lazy, cabeçalho fixo, 3 painéis desktop / separadores mobile, empresa/evento/estado, retoma do último lote, autorização com confirmação explícita, conferência e link. Se o serviço não existir: "indisponível", sem ações. IA/Gmail/Drive/TX/BP/pagamentos/extratos/bilheteiras listados como pendentes.

## Testes
- PostgreSQL 17.9 real descartável (socket /tmp, sem rede), pgcrypto real, 2 ligações: 21/21. `bunx vitest run --config docs/testes/issue333/vitest.pg.config.ts`
  Cobre: papel de outra empresa, fallback canónico, editor recusado, grants/ACL, validações, recibos, SHA-256 real, gate fechado, hash/prévia antiga, mesmo lote em 2 ligações (1 avulsa), 2 lotes mesma fatura (lock), legado mesma grafia nas duas ordens (índice canónico → 23505), falha injetada entre INSERT e auditoria (rollback total + retoma), resposta perdida após COMMIT, imutabilidade, tabelas financeiras com triggers proibitivos intactas.
- Handler com storage falso determinístico (fetch bloqueado): 12/12. `bunx vitest run --config docs/testes/issue333/vitest.handler.config.ts`
- UI + contratos: 4 + 8. Suite geral: 1299 passam, 0 falhas. tsgo OK. vite build OK.
- Prova PGlite antiga removida (substituída).

## Limitações / bloqueios
1. COMPROVADO: escritor legado com grafia normalizada diferente (ex.: "pt 500 111 222") não é bloqueado pelo índice canónico atual. Resolver exige índice normalizado (proposta separada, não aplicada). Até lá, a execução tem este risco documentado.
2. Storage real do Lovable Cloud (ACL do bucket, conflito real) não provado — falso determinístico apenas.
3. No sandbox o PostgreSQL corre com utilizador temporário pg333 (não pode correr como root).
4. Outras moedas, IA, Gmail/Drive e restantes operações: pendentes.

## Próximo passo
Revisão destas provas → aplicar migração, criar buckets privados e deploy (com autorização), com `DATA_ENTRY_UPLOAD_ENABLED` e execução ainda fechados até prova em Live.
