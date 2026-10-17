# #333 — reparação da etapa2 (sem deploy/DDL/Live)

Base recebida e observada: b4f32dfa7635f70d19e10ea0db31809417f22f2f. Janela/sincronização remota/único escritor confirmados pelo controlador no pedido; executor local confirmou HEAD igual. Executor único0 via Lovable, sem subagentes; #323 preservada.

## Correções
- Memória recebeu name/description/type; índice regenerado pelo script oficial, sem alteração do teste/skip/allowlist.
- Latest local usa hash e intent_seq dentro da empresa/owner/operação da consulta. Envelopes distintos não invalidam uns aos outros. Só páginas completas permitem essa afirmação local; servidor continua autoridade final.
- Uma página por clique, carregar mais por cursor e deteção de repetição. Não há ciclo até esgotar nem contagem total alegada.
- Confirmação adota retorno apenas se novo ID, mesmo hash, sequência seguinte, prior_attempt_id correto e estado prepare. Seleciona a nova reserva para consulta; não copia campos nem executa efeitos.
- Marcador de incerteza persistido ANTES da confirmação. Falha de transporte bloqueia nova confirmação/seleção; descoberta seguida de check read-only verifica vínculo da nova intenção. Ausência/inconclusão mantém bloqueio, nunca reenvio automático.
- Seleção e mudança de empresa/owner/operação invalidam respostas antigas; evento central de empresa invalida pedidos mesmo antes da atualização dos props. Navegar/cancelar não constitui prova de rollback.
- Rotear legacy exige contexto canónico válido e cliente sem reserva. Reserva/prepare incerto/seleção de tentativa nunca cai no writer antigo por capacidade indisponível. Antes de preparar persiste bloqueio; antes de execução valida tamanho/MIME/hash dos bytes vinculados à reserva.
- Comentários de fontes já integradas corrigidos; nenhum config, SQL aplicado, migração0190/0191, índice global ou tipo gerado alterado.

## Verificações locais atuais
- Focados: 63 PASS em 5 ficheiros (UI8, cliente13, proposta3, DataEntryDialog13, compat26), mocks locais sem chamadas Live/providers.
- Suite final completa: 168 ficheiros PASS, 1 skipped herdado; 1359 testes PASS, 1 skipped herdado, 11 todo herdados; zero falhas. Não foram criados skips nem alargadas guards.
- tsgo final em cópia sem .env/.git/credenciais: exit0.
- Vite build final nessa cópia: exit0; aviso de chunks grandes/PWA existente, sem erro. Build automático do preview: OK.
- Logs integrais: prova25. CI anterior39071452602/job117509759278 vermelha conforme controlador; CI remota desta reparação NÃO verificada, a conferir pelo controlador.

## Limites explícitos
- Prova23 retificada: hashes de fontes submetidas não são deployment_id/artefacto Cloud; listagem vazia não prova isolamento alheio; RPC própria não prova endpoint session (observado503); 28 checks não constituem aceitação ponta-a-ponta.
- Baseline agregado incluía user_roles e não certifica igualdade financeira por conteúdo; não inventámos comparação retroativa. Inventário privado anterior não disponível nesta reparação.
- Sem nova fixture, sessão, leitura/escrita Live, rede externa de negócio, deploy, DDL, flags true, financeiro ou Publish. Fixtures anteriores preservadas.
- Interações verificadas pelo DOM em testes locais, não aceitação Cloud. Fluxo completo scanner/editor com sessão real e execução de tentativa permanece NÃO verificado/fechado. Não foram refeitas provas antigas de concorrência PostgreSQL.
- Proposta SQL service-only não foi executada nem localmente: arranque PostgreSQL descartável falhou por ausência de identidades OS não-root no sandbox; três tentativas registadas. Não usamos a base Cloud como alternativa.

## Próxima autorização: proposta concreta, não aplicada
- `supabase/manual/20261017_issue333_capabilities.PROPOSTA.sql`: única função SECURITY DEFINER STABLE, search_path fixo, devolve apenas dois booleanos por operação. Sem linha => false; sem settings/grants/gate interno alterados; PUBLIC/anon/authenticated EXECUTE=false e service_role=true pretendidos.
- `patches/issue333/capability-reader.PROPOSTA.ts`: integração service-only inerte e não importada. Depois de DDL autorizada, substituir callback constante do endpoint por este leitor usando o cliente admin já existente. Auth/contexto do endpoint continuam obrigatórios; RPC falhada/malformada => ambas false; mutações revalidam gates próprios.
- Impacto futuro: uma migração tracked nova pelo mecanismo oficial + deploy apenas standalone-attempt-333; não ativa operação nem elimina índices. Frontend não lê settings nem recebe dados sensíveis.
- Antes de aplicar: ensaio PostgreSQL ACL efetiva PUBLIC/anon/authenticated/service, no-row/false/misto por operação e ausência de writes; testes de integração já presentes3/3; após autorização verificar registry/ACL/corpo/runtime e negativas sem flags true em Live. Ativação/piloto/índice/Publish continuam decisões separadas.

#333 permanece aberta/reservada e código/UI sob revisão independente; não se declara funcionalidade integral concluída.