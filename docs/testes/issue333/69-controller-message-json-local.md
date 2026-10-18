# Prova69 — primeira constante JSON oficial transportada por mensagem

HEAD inicial observado: bba36870933eacd2e22992f12de57d20b2be9230. Autorização18/10/2026 18:23UTC, âmbito LOCAL/ISOLADO. Nenhuma chamada Cloud/CLI/psql, credencial, conta/login/sessão/permissão/fatura/escrita/deploy/Publish. Contas59/63 não usadas; #323/DECISIONS preservados. Fases1–7feitas,8PARCIAL,9–18pendentes.

## Entrada e captura
Controller reporta SELECT oficial query_database e serialização automática de structuredContent, entregue integralmente na mensagem. Não observámos a invocação original: validamos o envelope recebido, não atestamos criptograficamente sua proveniência. Não foi convertido Go-map nem reconstruído `data`. Os bytes UTF-8 entre marcadores foram copiados literalmente, sem marcadores e sem newline final, para `/tmp/issue333-proof69/envelope-received.json`,0600, diretório0700. Anexo presignado falhou403 segundo controller; nenhum anexo disponível alegado.

705 bytes; SHA256 envelope:
`0115b2d3c4c42206ff1c1e7d17f508458b334beed430a3014255e016923f32a1`

SHA256 da query exata UTF-8 (sem trim/normalização):
`aa568e292cc8823072fef97e1af4e459ff11008c3cb557c3599fb3ca13cf7467`

JSON.parse local confirmou integer68(number), numeric"1.25"(string, SEM coerção), booleantrue, null, Unicode `ação — 東京`, objeto nested/null/array misto, integer array[1,2,3]. ID e query comparados com pedido local. O envelope recebido NÃO contém fingerprint/hash remetente/version/count: hash calculado localmente, sem comparação independente upstream possível. Compatibilidade da constante usa decode69 strict=false explicitamente; receiver futuro só aceita strict=true. Nenhuma promoção silenciosa da constante a contrato estrito.

## Adaptador local, não ligado ao executor Cloud
`pilot8/controller-message69.ts`: preparar/receber/cancelar chamadas finitas, sem espera/timer/SQL. Um pedido ativo por diretório privado; id nunca reutilizado. Pedido tem version1,id,query,fingerprint SHA256(query),maxBytes65536,expectedKeys,status. Resposta estrita tem version1,id,query,fingerprint,source,data,rowCount; exatamente uma linha agregada, chaves exatas e callback obrigatório de tipos/valores. Pedido deve ser SELECT previamente revisto: o filtro textual NÃO prova ausência de efeitos de funções SQL; controller deve usar conector oficial read-only e SQL constante revisto, nunca confiar em regex como sandbox.

JSON.stringify deve executar DIRETAMENTE sobre structuredContent.rows, incluindo-o em data sem converter numerics. Source é descrição, não prova de origem. Receiver valida id/query/fingerprint, versão, contagem, chaves, tipos e UTF-8; recusa string JSON duplamente codificada, texto map, truncamento sintático, tamanho excessivo, pedido consumido/cancelado/fora de ordem e concorrência duplicada. Bytes/receipt gravados antes de status consumed, ficheiros0600. Hash não é assinatura/HMAC; actor autorizado e canal oficial continuam pressupostos.

Prazo humano não usa timer: atraso de pedido ainda ativo não é recusado só pela idade; cancelamento explícito invalida respostas tardias. Contexto real deve ser revalidado por etapa antes de efeitos, não delegado a esta constante. Falha de commit mantém pending e pode deixar .tmp/evidências; parar e inspecionar, SEM retry automático. Não alegamos atomicidade multificheiro, fsync/power-loss recovery ou resistência a atacante local capaz de modificar pedidos privados. Nenhum novo driver Auth/worker/produto alterado.

## Comandos e resultados
```text
bunx vitest run src/test/issue333-controller-message69.test.ts
15/15 PASS (local, dinâmicos Node/doubles; não Cloud/PG/Chromium)
bunx tsgo -p docs/testes/issue333/pilot8/tsconfig66.json
exit0, sem diagnósticos
```
Logs integrais privados0600: `/tmp/issue333-proof69/vitest-final.log`, `typecheck-final.log`; tentativa inicial preservada em vitest.log/typecheck.log. Primeiro teste falhou por contagem errada683 versus705 bytes; corrigido ao valor medido. Typecheck explícito inicialmente0 mas harness app mostrou Object.hasOwn indisponível; substituído por hasOwnProperty.call. Teste inclui constante pública literal e não depende do /tmp privado; captura privada e receipt do teste deram os mesmos hashes. Testes adicionais: contrato incompleto, id/query/hash/count/version incorretos, null/chaves/tipos/extra row, UTF8 inválido, >64KiB local, truncamento/double encoding, cancelamento/late/ordem, duplicata concorrente, persistência0600/new instance, falha ao gravar sem consumo. Não executada suite completa/PG/Chromium: esta etapa não é piloto nem worker/UI. Build automático e diff finais reportados separadamente.

## Próximo teste concreto — controller read-only, não executado
Um SELECT sintético sem tabelas/dados pessoais:
```sql
SELECT 1024::integer AS n, repeat('ação — 東京|',1024) AS payload, jsonb_build_object('nullable',NULL,'items',jsonb_build_array(1,'ação',true)) AS nested_value
```
Controller prepara id novo `proof70-synthetic-0001`; calcula SHA256 dos bytes UTF-8 da query exata e envelope JSON.stringify({version:1,id,query,fingerprint,source,data:structuredContent.rows,rowCount:structuredContent.rows.length}). Envia envelope textual completo por send_message oficial + bytes/SHA256 calculados upstream separadamente. Receiver captura sem normalizar, compara bytes/hash independentes e schema n(number1024),payload(string exata),nested_value. Depois, somente após sucesso, propor aumento escalonado até limite acordado; não presumir limite oficial64KiB (é limite LOCAL conservador). Nenhuma query nesta prova69.

Chunks não implementados nem validados: oversized é recusado. Proposta futura exige id/query/schema fingerprint,totalBytes,totalHash,totalChunks,index,chunkBytes,chunkHash,encoding base64 UTF8, limites totais, ordem estrita e rejeição de duplicata/falta/late; montar integralmente e verificar hash antes de JSON.parse/consumo. Sem teste oficial real de tamanhos/chunks, NÃO habilitar chunks/driver piloto. JSON válido truncado semanticamente só é detectável com upstream totalBytes/hash/count independentes; constante69 não os fornece.

Reserva333 libertada no fecho desta entrega, uma única linha durante execução; #323/restantes preservados. GitHub/CI final e novo commit não confirmados; nenhum comando git stateful executado. Complemento Cloud continua proibido nesta etapa.