# #333 — leitor seguro de capacidades aplicado, sem ativação

17/10/2026. Executor único0-CoworkChatGPT via agente ERP, sem subagentes. Base recebida307d9a125b24055d3d48bc1eae18a9c954250b3c conferida; sincronização/janela/agentFinished confirmados pelo controlador. Reserva333 atualizada antes de atuar;323 e ficheiros reservados intactos. CI39073230691/job117515014299 success em todos os passos confirmado independentemente pelo controlador; não é CI desta entrega.

## Pré-requisito PostgreSQL real
- runuser falhou; setpriv --reuid=1000 --regid=1000 --clear-groups usou identidade OS lovable existente, sem modificar plataforma/contas OS. PostgreSQL17.9 descartável, socket exclusivo /tmp, sem TCP/credenciais Live.
- SQL aprovada aplicada byte-exata ao descartável. PASS/exit0: no-row, false/false, ambos casos mistos, reposição false/false, STABLE, SECURITY DEFINER, search_path fixo, PUBLIC efetivo via aclexplode/acldefault, has_function_privilege anon/auth=false/service=true; service em transação READ ONLY; negativas reais anon/auth SQLSTATE42501; gate/settings originais e ACL/RLS intactos.
- Dados true existiram apenas no descartável. Script reproduzível: capabilities/validate-local.sh; exige cluster vazio local. Logs integrais não sensíveis: prova27.

## Código/testes
- Leitor no diretório da própria função, admin existente, callback canónico; sem import entre funções. Endpoint continua Auth+contexto canónico antes de ler; sem writes ou dados sensíveis; booleanos estritos, falha fechada.
- Testes novos9: leitor misto/ausente/malformado/erro, handler sem Auth/contexto forjado/contexto recusado, CORS e ausência de transport/mutações. Mocks e fetch proibido.
- Focados34 PASS. Suite final169 ficheiros PASS,1368 testes PASS,1 skipped/11todo herdados, zero falhas. Sem skips/allowlists novos.
- Alias Vitest e declaração tipada do specifier Deno Zod resolvem import do handler nos testes locais, sem substituir tipos por any nem modificar guards.
- Harness automático typecheck/build: build OK em22:55:10Z após corrigir resolução TS. Não corremos build/typecheck manualmente. Estado hosted CLI ainda reporta build da base307d9a1; não o confundimos com prova desta entrega. CI desta entrega pendente do controlador.

## Aplicação oficial
- Única migração: drizzle/migrations/0192_issue333_service_only_capability_reader.sql, ferramenta oficial. Registry real drizzle.__drizzle_migrations id194, created_at1792277634936.
- Fonte SQL aprovada = arquivo tracked = registry SHA256: d2689cd635972292a93fd5abb4017f4ddd979760ccb0b7a56c6898580ab1c422; cmp exit0. Comentário PROPOSAL preservado por exigência byte-exata, esta prova regista que foi aplicada.
- Definição canónica PostgreSQL descartável=Live SHA2566400f9da2b94ba4daab5bdb5f03f50ee06bdf503a93f5e421dbbdf6e5e5e532d; prosrc MD5 igual3d990d83ddf44cd3e1c1fb82d7aa7d23.
- Live: STABLE=true, SECDEF=true, search_path=public, pg_temp; PUBLIC/anon/auth EXECUTE=false,service=true. Settings vazias, gate interno service EXECUTE=false, settings service SELECT=false. Nenhum owner/ACL/RLS/corpo existente alterado.0190/0191 e índice global intocados. Types atualizados só pela ferramenta oficial.

## Deploy e verificações Live
- SOMENTE standalone-attempt-333; verify_jwt=true preservado. Fonte submetida SHA25696ca61df8574e96c581dcc0eec2168cd90cb150b3fd96368a2dd5349e75489bb.
- Telemetria de OPTIONS/POST observou versão7, identificador de função7912c98b-dde3-49b5-858d-c45a8caf6454 e deployment_id qualificado pela instância, terminado nesse identificador + _7. Identificador completo conservado só no inventário privado, sem expor ID da infraestrutura. Source retrieval/hash do artefacto runtime não disponíveis; fonte submetida NÃO prova identidade do artefacto.
- Credencial service legítima só em memória: RPC HTTP200 false/false. Anon RPC HTTP401/SQLSTATE42501; endpoint sem sessão/anon401; OPTIONS200 e headers x-attempt-user/company presentes.
- Sem criação/mint de sessão/JWT/conta ou desbloqueio. RPC authenticated real e endpoint autenticado não exercitados: ACL efetiva auth=false provada, não equivale a chamada com sessão real. Service nunca convertido em utilizador.
- Baselines separados por hash de conteúdo agregado no servidor: transactions,transaction_payments,event_forecasts,standalone_invoices,financial_accounts; settings; helpers/corpos/owners/ACL; policies/tableACL/RLS; storage técnico/buckets/sessões; roles separadamente e contas banidas. Antes/após migração/após deploy iguais; hashes só no inventário privado, sem dados pessoais/registos exportados. Não usar count/max como prova financeira.

## Pendências e rollback sem ativação
- Revisão independente/CI desta entrega e aceitação autenticada seguinte pendentes. Endpoint data-entry session503 e isolamento alheio da prova23 não revalidados; não declarar aceitação integral.
- Rollback recomendado, apenas com autorização própria: redeploy versão anterior do endpoint para callback fechado; manter função read-only e migração tracked, não DROP nem apagar registry/dados. Gates permanecem fechados. Nenhum rollback executado.
- Sem Publish, flags true, uploadEnabled true, financeiro/faturas/fixtures, índice global, outros deploys, providers/crons/emails/OAuth.

#333 aberta/reservada; #323 preservada. Leitor concluído neste âmbito, não a funcionalidade integral.