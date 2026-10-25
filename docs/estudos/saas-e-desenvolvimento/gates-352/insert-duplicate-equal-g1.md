# #352 — insert_duplicate_equal; G1 desde vazio

Execução Codex, autorização Pedro nesta sessão e parecer Claude25/10. Origem: artefactos nativos privados, fontes do plano e testes locais. UTC25/10/2026,02:36:17–02:40:00 (24/10,23:36–23:40 Fortaleza).

## Resultado

**G1 vermelho; G2 não executado.**366 entradas concluídas (130ledger+234órfãos+2seeds),367tentadas,1falhada,1.087não tentadas de1.454. [Run40155054478](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40155054478), [código ae4b5419](https://github.com/pedrompropicio/mundopropicio-replay/commit/ae4b5419b3c23de2231ab568dd235d0ba2a87257), [artefacto12583858406](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40155054478/artifacts/12583858406). ZIP SHA256:1fc7859caf4e166341d5a4a0a1588f1eaf1da7fdae22f38ddaf8f75dc6d63c9a, reconferido após download.

Passaram20260408095142,20260411120205 e20260429023935. Seed isolado:117linhas,0parent_id por resolver. MP e Coala executadas. **Checkpoint20260430033938 não alcançado**; igualdade final com Live ainda não demonstrada.

## Regra e testes

23505 apenas em INSERT VALUES, linha a linha com savepoint/subtransacção. A constraint diagnosticada identifica a linha existente na mesma tabela; compara todas as colunas fornecidas excepto id/created_at/updated_at. Texto com trim/case-insensitive; UUID tipado exacto. Igualdade permite salto; diferença ou ausência de prova pára. Ambas as linhas e valores normalizados ficam exclusivamente no artefacto privado, ledger/skipped-idempotent.json. SQL de origem, overlays, seeds e plano inalterados nesta etapa. INSERT SELECT, WITH e corpos de funções não recebem esta variante.

33testes unitários PASS. Os3casos SQL locais PASS. Nativo:7casos novos PASS — real salta; nome diferente pára; pai diferente pára; colunas implícitas; várias linhas iguais; várias linhas diferentes; colisão noutra tabela por trigger. Autotestes anteriores:14base+1using_index+3trigger_equal+3policy_equal PASS.

Primeira tentativa40154832579 parou antes de qualquer migração num autoteste: wrapper devolvia22004 em tabela ausente. Correcção do runner preserva42P01; comprovada localmente e no run novo. Não foi acrescentada regra de salto para esse erro.

## Primeira falha não coberta

orphan/20260429225802_6f685f39-831e-4467-95de-8bc01ad2aa85.sql,L60:SELECT chama public._seed_coala_from_mp; dentro da função há INSERT SELECT de categorias. SQLSTATE23505, constraint account_categories_code_key. A versão foi revertida e a execução parou. Não é INSERT VALUES e não cabe na autorização actual.

Evidência de origem: orphan/20260429233657_3a6b2b67-7388-41ca-ba37-abc6ff176c0f.sql,L3–6 substitui a unicidade global pela unicidade company_id+code, mas vem depois da chamada que falhou. **Proposta para parecer Claude, não aplicada:** rever esta dependência histórica e decidir explicitamente a posição da alteração de unicidade ou o tratamento da chamada de cópia. Não ignorar o erro nem alargar insert_duplicate_equal a funções/INSERT SELECT.

## Saltos e segurança

100destrutivos;943idempotentes:516base+74using_index+81trigger_equal+271policy_equal+1insert_duplicate_equal. O novo salto é20260411120205,L3 (linha da tupla; INSERT começaL2). [Anexo de metadados](insert-duplicate-equal-g1.json): ficheiros, linhas, hashes e variantes; valores apenas no privado. Comparação final dos objectos com Live pendente do G2.

check-pii SQL:1.229ficheiros,0ocorrências. Agendador desligado e firewall activos;2crons exportados sanitizados antes de unschedule local;0depois. Nenhuma consulta nova nem escrita em Live nesta etapa; sem DSN, homologação, infraestrutura paga, deploy ouPublish.

check-pii sobre docs/estudos/**:39ficheiros de base,12ocorrências preexistentes do scanner, sem valores publicados; conteúdo novo verificado separadamente. Não se declara o histórico inteiro verde. Docs fora da #352 preservados byte a byte. D-ERP309 já registada na etapa anterior, sem duplicação.

## Fecho

Reserva177e20b1 libertada neste fecho; #329 reconfirmada antes do push. #352 permanece aberta. A próxima decisão é a dependência de unicidade da cópia Coala; G2 só depois de G1 verde.
