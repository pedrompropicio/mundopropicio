# #333 fase12d — integração da revisão Ticketline (LOCAL, FECHADO)

Base: main = Lovable 1af2294eb13045677ace9cf8ae34a2821146a716; CI run39433338569 SUCCESS (controller). Alterações posteriores a 6f40e4a (só QUADRO) preservadas.

## Concluído
- Index: `ticketlineErp` (eventos por texto ou id escolhido, fechos `ticket_office_settlements`, apuramentos, contas) com o JWT do chamador;
  `scanAttachment` = scanner existente (`generateScannerAnalysis` + controlo durável), só montado com análise ativa; `rpcReviewStore`
  montado só com `REVIEW_SCHEMA_REVIEWED=true` e, mesmo assim, cada gravação/autorização sonda o esquema `333-12d` e o gate no SQL (503 se faltar).
- Ações `ticketline_*` partilham o gate do assistente e o âmbito nominal (fechados ⇒ 503).
- Conversa livre: `prepare_ticketline_proposal` (extração da IA sobre o corpo lido no servidor) gera candidato assinado com proveniência `model`;
  o parser determinístico fica só como alternativa ("Rever fecho deste email").
- Anexos: `ticketline_attachments` lista metadados da mensagem escolhida (sem attachment_id); o anexo tem de constar da lista lida no servidor.
- Contas: `ticketline_accounts` devolve contas ativas e não ocultas da empresa canónica, por nome; validação da conta repete-se no servidor.
- Prévia devolve os eventos possíveis do ERP; o evento escolhido é relido por id.
- Revisão humana explícita (`confirm_review`, só do pedido autenticado) é condição para desbloquear ações e entra no hash.
- Autorização: subconjunto explícito de ações desbloqueadas, fechado por dependências (TS e SQL). Preparar/apurar (a1–a4) ≠ liquidar (a5).
- Liquidação (a5): só com recebimento confirmado pela pessoa E fecho canónico confirmado; compara conta de transferência, `net_transferred`
  e data com o fecho (nunca Σ do apuramento). Diferenças → pendência; fecho sem transferência → retido na bilheteira; >1 fecho → sem valor canónico.
- UI: seletor de anexos, lista de contas, eventos, linhas editáveis, confirmação, ações por etapa com dependências automáticas.
  Visual com mocks: desktop 1280 e telemóvel 375 sem overflow horizontal (scrollWidth = clientWidth), sem erros de consola. Harness: `visual12d-harness.tsx.txt`.

## SQL INERTE revisto (`supabase/manual/20261020_issue333_assistant_review.*`)
Achados da revisão 12c corrigidos:
1. Default ACL do projeto concede tabelas/funções a anon/authenticated/service_role/sandbox_exec*: o 12c deixava service_role com escrita e sandbox_exec* com acesso. Agora revoga de todos os papéis exceto o dono; service_role só SELECT.
2. EXECUTE só service_role; o browser não chama o RPC nem fornece proposta autoritativa. Actor do JWT verificado, revalidado no SQL (auth.users ativo/não banido, empresa ativa, admin/manager).
3. Hash recalculado no SQL (`_de333_canon` = canon() do servidor; provado com UTF-8, aspas e quebras de linha).
4. Versões/autorizações imutáveis (UPDATE/DELETE/TRUNCATE recusados também ao dono).
5. Autorização por subconjunto fechado por dependências; uma por versão; replay idempotente.
sha256 (16): INERTE 0ab198432d572c7f · ROLLBACK d41194054dcc3be4 · readback ecce58c94a37e497.
Prova PG17 descartável: `pg/assistant-review12c.sh` + `pg/assistant-review12d-gen.ts` → `pg/assistant-review12c.out.txt` (28 verificações).

## Testes
`src/test/data-entry-ticketline-review12d.test.ts` (10) + ajustes 12/12b/12c. Suite 1858 PASS/6 skip/11 todo; tsgo e Deno check limpos.

## Falta para teste real
1. Rever e aplicar o SQL INERTE ("Sim" do Pedro).
2. Abrir janela: ASSISTANT_ENABLED, escopo nominal Pedro+empresa, REVIEW_SCHEMA_REVIEWED, gate SQL; análise só se o anexo for usado.
3. Uma chamada real do modelo e leitura Gmail real na janela.
4. Executor financeiro continua inexistente: autorização fica `authorized_inert`.

## Pacote único de ativação (para revisão)
1. DDL: só `20261020_issue333_assistant_review.INERTE.sql`, bloco único, lock_timeout 5s; antes/depois `readback.SELECT.sql`
   (4 tabelas RLS on, ACL `postgres` + `service_role=r`, função só service_role, 4 triggers, gate false).
2. Código: `REVIEW_SCHEMA_REVIEWED=true`, `ASSISTANT_ENABLED=true`, `ASSISTANT_REVIEWED_SCOPES={Pedro:Mundo Propício}`; deploy SÓ data-entry após CI verde.
3. Gate SQL `enabled=true` só durante a janela (≤ 30 min); limites do orquestrador inalterados (8 passos, 40k tokens, 60 s).
4. Teste humano: Pedro em /transacoes → Assistente, pede o fecho, revê, guarda e autoriza só a1–a2; conferir readback (1 revisão, 1 autorização inert, 0 linhas financeiras novas).
5. Fecho: gate SQL false, flags false, scopes vazios, deploy só data-entry; rollback só se 0 linhas (o rollback recusa com dados, por retenção).
