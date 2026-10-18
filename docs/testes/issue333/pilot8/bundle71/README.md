# Bundle71 — próxima leitura real, não executada

Ordem: metadata-0001 → baseline-0001 → baseline-0002. Uma consulta por resposta, uma linha; nenhuma identidade nova nem exclusão de artefactos59/63. Dois baselines independentes são intencionais: detetam alterações entre snapshots, não se devem combinar como prova falsa de estabilidade. Metadata agrupa colunas necessárias, cinco hashes de fontes e permissões ativas no mesmo SELECT. Baseline agrega quinze relações e configurações/ACL/owners das funções, gates globais e contagem da allowlist. Apenas SELECT/catalog/count/hash; nenhuma função de aplicação é invocada.

1. Preparar pedido local e terminar:
```text
bun docs/testes/issue333/pilot8/bundle71-cli.ts prepare /tmp/issue333-bundle71 proof71-metadata-0001
```
2. Controller lê o contrato exato e executa `query` pelo conector oficial read-only `query_database`. Não usar CLI SQL, relay antigo ou converter representação map. Serializar diretamente:
```js
JSON.stringify({version:1,id:request.id,query:request.query,fingerprint:request.fingerprint,source:'official controller query_database structuredContent.rows',data:structuredContent.rows,rowCount:structuredContent.rows.length})
```
3. Enviar envelope completo e metadados independentes `{bytes,sha256}` calculados upstream sobre UTF-8 sem newline. Capturar os bytes recebidos sem reconstruir conteúdo em `/tmp`0600; consumir:
```text
bun docs/testes/issue333/pilot8/bundle71-cli.ts receive /tmp/issue333-bundle71 proof71-metadata-0001 /tmp/issue333-bundle71/envelope-original.json /tmp/issue333-bundle71/upstream.json
```
4. Validar incompatibilities=[]; cinco hashes contra a revisão de fontes já aprovada e active_allowlist=0. Só depois preparar baseline-0001 e, após consumo, baseline-0002 pelo mesmo procedimento. Comparar todos os counts/hashes/config, core_open=attempt_open=0. Configuracões normalizam apenas NULL de catálogo como DEFAULT/[] no bundle; o driver legado preserva NULL. Não publicar respostas de uma identidade futura.

Tamanhos estimados conservadores, NÃO medição Cloud: metadata16KiB, cada baseline32KiB incluindo query/envelope. Queries3463/3343bytes. Limite LOCAL65536bytes, resposta excessiva/SQL excessivo para antes do consumo; propor redução dos campos necessários, nunca chunks ou150KiB. Dados internos usados para hashes nunca são devolvidos individualmente. O custo do hash cresce com os dados; tempo máximo real não foi medido.

Depois desta validação real: apresentar prontidão/plano de UM piloto e o mecanismo autorizado de AuthAdmin; não executar nem criar conta. A entrada conectada continua a exigir autorização por etapa e ambiente AuthAdmin privado indisponível por defeito. O bundle não autoriza essas operações.