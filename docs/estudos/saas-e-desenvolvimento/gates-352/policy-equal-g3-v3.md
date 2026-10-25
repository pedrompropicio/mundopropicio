# #352 — policy_equal + G3 fatias 1–2, plano v3

Executor Codex. Autorização Pedro6391991066, parecer Claude6391983710 e correcção explícita para117 linhas/checkpoint. Execução24/10/2026,23:13–23:16 Fortaleza (25/10,02:13–02:16UTC).

## Resultado

**G1 vermelho:**150 entradas concluídas (76ledger+73órfãos+1seed),151tentadas,1falhada,1.303não tentadas de1.454. **G2 não executado.** [Run40153614267](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40153614267), [código privado8cba0ac7](https://github.com/pedrompropicio/mundopropicio-replay/commit/8cba0ac767649d2162d28c48f32b80e05dae2ca7), [artefacto privado12583637083](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40153614267/artifacts/12583637083). ZIP SHA256 e5947a5d3257d753d0c026fa968e605d17ae1acf1a3d4a7cb759fbfce8bb7e70, reconferido após download.

Seed isolado na base que acabou de aplicar o ledger até20260317214904: **117linhas,0parent_id por resolver,PASS**, antes de qualquer migração seguinte. O seed é a entrada seguinte no plano, antes20260318030327. Nenhuma linha Live publicada neste relatório.

Critério20260408095142 **PASS** (bloqueio anterior ultrapassado);20260429023935 **não alcançado**;checkpoint20260430033938 **não alcançado**. A igualdade final do plano de contas ainda não está demonstrada.

## Implementação autorizada

- policy_equal substitui a auditoria retrospectiva. No erro42710, a definição pretendida é canonicalizada por policy de nome temporário na mesma tabela local, dentro de savepoint revertido. Comparação em pg_policies por nome+tabela, cmd/roles/permissive/qual/with_check normalizados. Só igualdade permite salto; divergência fica no erro. Ambos os textos no artefacto privado, ledger/skipped-idempotent.json.
- Testes:28unitários PASS; SQL localPGlite dos3casos PASS. Nativo:14autotestes anteriores+1using_index real+3triggers+3policies PASS. Policies:real salta;qual diferente pára;roles diferentes param.
- Seed117:105linhas actuais+9folhas na pré-imagem+3grupos reconstruídos; sem company_id, com remoção prévia dos códigos legados. Manifesto privado seed/manifest.json contém query,UTC,contagens,hashes e mapeamento com origem no ficheiro20260430032104. Dados e SQL integrais só no privado.
- MP:substituição autorizada na linha171 do overlay20260429021930, sete colunas, sem email. Coala:entrada seed na posição temporal do created_at medido emLive. Ambos publicados no plano, **ainda não executados** devido à paragem anterior. Remoções20260429030704L3/20260429033420L110 inalteradas.
- Checkpoint implementado:query em checkpoints/20260430033938.sql e referência de 114 linhas em JSON, SELECT novo às2026-10-25T02:10:19.264Z. Após conclusão da versão compara resultados ordenados, diferença pára. A query é a mesma nos dois lados; não foi alterada para fazer passar.

## Primeira falha não coberta

Ficheiro orphan/20260411120205_d9b969db-165f-4aa0-86e3-6e549305beda.sql,linha2,INSERT,SQLSTATE **23505**,constraint **account_categories_code_key**. O ficheiro anterior20260408095142,L27,insere o mesmo código com ID gerado;20260411120205 usa ID fixo e trata conflito apenas por ID. O valor de categoria e SQL ficam no artefacto privado. A versão falhada foi revertida; não houve continuação nem regra nova para ignorar23505.

Proposta para revisão Claude, não aplicada: decidir a reconciliação de identidade entre estes dois INSERT históricos com prova de Live e usos posteriores do ID. Não trocar automaticamente a chave de conflito, não remover o INSERT e não alargar a classe idempotente.

## Saltos

91destrutivos em6ficheiros.408idempotentes em35ficheiros:172base+41using_index+15trigger_equal+180policy_equal. Metadados completos (ficheiro/linha/hashes/variante) no [anexo](policy-equal-g3-v3.json); definições e dados apenas no artefacto privado. Equivalência com catálogo Live final continua pendente do G2.

## Controlos e limites

check-pii SQL:1.229ficheiros ledger/orphan/overlay/seed,0ocorrências. Cron off e firewall verificados;0jobs antes/depois. Sem escritaLive,DSN,targethomolog,infraestrutura paga,deploy ouPublish. Plano v3 tem711ledger+499órfãos+242Drizzle+2seeds. Originais preservados.

check-pii executado sobre todos os 37 ficheiros existentes em docs/estudos/** no HEADfd95b16f (hashGit de cada um conferido):12ocorrências preexistentes do scanner, sem valores expostos; lista tipo/linha no anexo. Não se declara o conjunto histórico verde. O conteúdo novo/diff é verificado separadamente antes do push, sem copiar dados Live. Documentos fora da #352 mantidos byte a byte.

Limite pendente do checkpoint: o seed autorizado não inclui created_at; por isso o filtro histórico sobre a base reconstruída ainda precisa de validação no momento do checkpoint. Nenhuma alteração desse filtro ou coluna foi presumida.

## Fecho

D-ERP309 registada conforme6391926149:repositórios mantidos no proprietário actual até homologação operacional; sem transferência nesta etapa. Reserva `fd95b16f85a05cb76a4ffdbe5b7d18a955e22c9d` libertada no fecho, com #329 reconfirmada imediatamente antes do push. #352 aberta. Próximo passo é revisão da colisão23505;G2 aguardaG1verde.
