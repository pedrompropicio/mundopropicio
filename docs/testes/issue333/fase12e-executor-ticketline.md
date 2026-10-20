# #333 fase12e — executor Ticketline autorizado (LOCAL, FECHADO no Cloud)

Base: main = Lovable 35635b75317b32af39070353e4668d35753f8682; CI run39437839013 SUCCESS (controller). Sem Cloud DDL/DML, deploy, Publish, gates, modelo ou Gmail reais.

## Writers reutilizados (mapeados no projeto, só leitura)
- a1 apuramento: INSERT `ticket_office_statements` + `ticket_office_statement_lines` (mesmas colunas/constraints; trigger `tosl_guard`), estado draft.
- a2: `confirm_ticket_office_statement(uuid)` — writer canónico chamado tal como está (Σ = total, sem pendentes, admin/manager).
- a4: só leitura (despesas pendentes do evento); não cria despesas.
- a3: HUMANO no modal (`save_ticket_office_settlement`, cálculo de receita/deduções no ecrã). Não foi copiado para SQL: duplicaria regras globais. O executor só confere o fecho confirmado.
- a5: regra do painel "Confirmar crédito" (`TicketOfficeSettlementsPanel`): as 2 pernas `TRF-FECHO-*` pendentes → paid, payment_date, paid_amount = amount. Nunca cria transação/pagamento; já pago = conferência com 0 escritas; estorno pendente → recusa (fluxo manual).
- Nenhum componente #323/#322 tocado.

## Executor (`supabase/manual/20261020_issue333_assistant_executor.*`, INERTE)
- Identidade só de `auth.uid()`/`current_company_id()` da sessão; EXECUTE só `authenticated` (service_role/anon recusados). 12d mantém-se service_role com actor derivado do JWT verificado no servidor e revalidado no SQL; o browser nunca chama nem fornece actor.
- Carrega versão/efeitos SÓ da revisão persistida; recalcula hash; versão atual tem de ser a autorizada; ação ∈ autorização; dependências já conferidas.
- Escrita + conferência (readback) + registo na mesma transação; `UNIQUE(authorization_id, action_id)`, `FOR UPDATE` na autorização, advisory lock por número. Replay devolve o resultado gravado. Execuções imutáveis. Gate próprio false. Rollback recusa com execuções.
- Recheca no momento: evento sem fecho confirmado, número sem duplicado (case-insensitive), apuramento inalterado antes de a2, fecho/transferência iguais aos efeitos antes de a5, data não futura (Lisboa).

## Prova PG17 descartável — 29 verificações (`pg/assistant-executor12e.sh` → `.out.txt`)
gate fechado; service_role/anon sem EXECUTE; sem sessão/outro user/outra empresa; dependência; ação não autorizada; a1 real; replay sem duplicar; a2 com writer real; status só leitura; dados alterados; a4 0 escritas; a3 aguarda modal sem registo; a3 após fecho; evento fechado depois; duplicado por outro caminho; versão nova; hash adulterado; crash antes do commit (nada gravado, reexecução segura); concorrência (1 apuramento); a5 liquida 2 pernas; replay a5; já creditado 0 escritas; fecho alterado → recusa; imutabilidade; readback ACL; rollback com/sem dados; esquema/ACL igual; reaplicar/deriva.
Limite: tabelas ERP são stub com as constraints/trigger lidas do projeto; triggers de `transactions` (materialização de pagamentos, guardas) NÃO estão na prova — validar na janela real.

## Código
`_shared/assistant-executor.ts` (cliente JWT do chamador, recusas definitivas vs incerto, links), handler `ticketline_execute`/`ticketline_execution_status` (503 sem executor), index `EXECUTOR_SCHEMA_REVIEWED=false`, bilheteira escolhida por pessoa (validada no servidor, tipo ticket_office) nos efeitos, `TicketlineExecutionPanel` (resultado só conferido, incerto → "Verificar resultado").
Testes: `src/test/data-entry-ticketline-executor12e.test.tsx` (10). Suite 1867 PASS/6 skip/11 todo (+1 flake de carga em checkpoint66, 18/18 isolado); tsgo e Deno limpos. Visual mocks 1280/375 sem overflow (`visual12e-harness.tsx.txt`, `visual12e-mob.png`).

## Pacote único de aplicação/ativação/teste/fecho (para revisão)
1. Readback 12d e 12e (antes). Aplicar `20261020_issue333_assistant_review.INERTE.sql` (sha16 0ab198432d572c7f) e depois `20261020_issue333_assistant_executor.INERTE.sql` (d6c37fb54caa7d01), cada um bloco único, lock_timeout 5s. Readback depois (ACL: tabelas postgres + service_role=r; review RPC só service_role; executor só authenticated; gates false; `md5(confirm_ticket_office_statement)` registado).
2. Código: `REVIEW_SCHEMA_REVIEWED=true`, `EXECUTOR_SCHEMA_REVIEWED=true`, `ASSISTANT_ENABLED=true`, scopes = {Pedro:Mundo Propício}; CI verde; deploy SÓ data-entry.
3. Janela ≤ 30 min: gates SQL review+executor true; limites do orquestrador inalterados.
4. Teste humano (um fecho real): conversa → email → revisão (bilheteira, evento, linhas, confirmação) → guardar → autorizar a1,a2,a4 → executar → conferir no ecrã Bilheteiras. a3 no modal pelo Pedro; a5 só se houver transferência "a receber" e recebimento verificado no banco.
   Sucesso: 1 apuramento confirmado com Σ = total; execuções = ações executadas; 0 transações novas criadas pelo executor; a5 (se feito) = 2 pernas paid na data indicada; nenhuma linha fora da empresa.
5. Fecho: gates false, flags false, scopes vazios, deploy só data-entry; readback. Rollback SQL só sem execuções; efeitos financeiros revertem-se pelos fluxos canónicos (estorno), nunca por DROP.
