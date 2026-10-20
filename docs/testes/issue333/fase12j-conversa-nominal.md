# #333 12j — conversa+leitura/revisão nominal (Pedro "Sim" 20/10 15:08 Fortaleza)

Base 23b3e4471a6af87a01d2f8578a576dd77d40da11 (CI run39471822906 SUCCESS).

## Código (preparado, NÃO deployado)
- `data-entry/index.ts` sha256 bad41ce54d58d69e6ab87bf80ceaaa413d58483725f10a5c4fdfa7f7d017809c: ASSISTANT_ENABLED=true; âmbito nominal único d8e502f7…:7c858982…; cada pedido exige linha em `data_entry_assistant_scope_333` com expires_at>now() (leitura SQL, fail-closed) → expiração efetiva no servidor, revogável. Scanner existente só no candidato de anexo da revisão (REVIEW_SCANNER_ENABLED). Upload=false, ANALYSIS_ENABLED=false, executor SQL false.
- `data-entry/handler.ts` sha256 a115ea42adf13c2b3daf28ba45ff974e7b3739e12be5bec905e2ffcf7ca20156: verificação de âmbito aguardada (async) em status/conversa/revisão; scanner depende só da presença do adaptador.
- Testes: suite 1874 PASS/6 skip/11 todo; teste dirigido âmbito expirado→503 e capability false.

## Controlo do serviço
`data_entry_analysis_control_333` não tem prazo próprio: o prazo vem do âmbito (verificado antes de cada conversa/revisão); o controlo é fechado no script de fecho. Stop/402/403 sem retry: comportamento existente.

## Janela (só com Pedro no preview, depois do deploy)
- Abrir: `supabase/manual/20261020_issue333_12j_janela_conversa.INERTE.sql` sha256 e3aad2961ee99cf18cef86cd020409920668e0a375f18e377824dec44eed2b4d (30 min; recusa se executor≠false, âmbito já existente ou controlo ocupado).
- Fechar/revogar: `supabase/manual/20261020_issue333_12j_fechar_conversa.INERTE.sql` sha256 de31ad4af89213eba23712591bb66d8dd0df153b31054e7f58303c592e20c156 (controlo só fecha sem claim ativo; se houver claim, repetir após fim).

## Estado
Preparado+testado local. Pendente: CI no novo SHA → deploy só data-entry → janela com Pedro → teste → fecho.
