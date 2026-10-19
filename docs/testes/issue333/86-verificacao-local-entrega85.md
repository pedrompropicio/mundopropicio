# #333 tarefa86 — verificação técnica local, não piloto/release

## Base e âmbito
HEAD inicial d23c38c696b6b6befa59d6465e9fe26d813bf57d igual ao indicado por Pedro. CI403 run39178322620/jobquality117825530877 SUCCESS recebido do controller, não consultado pelo agente. Upload/ANALYSIS_ENABLED/ANALYSIS_PROVIDER_REVIEWED false preservados. Sem modelo/gateway real, documentos reais, valores de segredos, Cloudwrites, Auth/Storage, DDL/DML, deploy ou Publish. Root AGENTS e323 intocados.

## Falhas comprovadas e correções
1. Deno2.6.10 check exit1 TS2353 em analysis-stream headers: SDK Node ResponseInit incompatível com Deno ambient. Usar factory SDK apenas com stream e aplicar headers na Response nativa; check agora0, CORS/no-store testados.
2. Erros HTTP403/429 convertidos em NoOutputGeneratedError pelo result.output e status perdido503: capturar onError request-local, preservar upstream status no mapa público. SDK default console.error imprimia corpo/request; substituído por captura privada. Sem retries, URLs/tokens/requestmetadata não saem no erro UI nem console.
3. JSON.message não seguro por natureza: eliminado parsing para apresentação. Mensagens públicas fixas400/401/402/403/404/429 e fallback503, status original preservado. Nenhum corpo ou mensagem upstream é exibido.
4. Removida factory response() que permitia sendReasoning:true; análise expõe somente dados finais validados via analysis-stream. Modelo/endpoint/6000tokens e reasoning low mantidos.
5. Cancelamento explícito prevalece sobre erro genérico SDK e devolve499. Erro/output inválido não produz candidatos ou sucesso; nenhuma repetição automática.
6. Testes que importam Deno npm: usam aliases Vitest e declarações reexportando tipos reais SDK, não any. Harness default não exige browser/tmp preexistente; runtime Deno é opt-in separado.

## Prova real executada
Instalados/resolvidos: ai6.0.309, @ai-sdk/openai3.0.130, zod3.25.76. Deno2.6.10/V8 14.5.201.2/TypeScript5.9.2. Imports npm major preservados: resolução futura/hospedada não é pin imutável nem disponibilidade de modelo.

- Vitest inicial39:37PASS/2FAIL comprovando perda403/429. Após correção,9testes86PASS;30regressões85 jáPASS e não repetidas sem motivo.
- Deno check dos provider/analysis-stream/service/index exit0.
- Deno test adaptador real → schema → validação → SSE final1PASS exit0.
- Deno bundle index inteiro190módulos/2.11MB exit0; comando experimental, não equivale deploy/runtime hospedado.
- Harness automático tipos/buildOK observado no log; não executado build manual nem suite main indiscriminada.

Comando reproduzível: `python3 docs/testes/issue333/analysis86/run-local.py`. Subprocessos recebem ambiente sanitizado PATH/HOME/NO_COLOR, sem segredos. Check/bundle podem resolver dependências npm locais/registry, mas nunca gatewayAI. Deno teste sem allow-net/read, fetch totalmente simulado. Dependências importadas exigiram sys=hostname e env=OPENAI_BASE_URL (ausente no ambiente sanitizado); erros NotCapable reais registrados, nunca contornados com allow-all ou leitura de segredo. Sem estas permissões mínimas, import do SDK falha; compatibilidade no ambiente hospedado permanece por verificar.

Vitest cobre strict schema object/required/additionalProperties false,6000tokens/store:false/stream:true/reasoning low/sem tools; dados finais sem raciocínio/encrypted/requestIDs/chave sintética; HTTP403/429 terminal/status/sem log/1fetch; recusa200 vazia, vazio, JSONinválido/schema inválido; cancelamento499; factory UI ausente. A recusa200 vazia é tratada como falha de validação, não como bloqueio global. Não há reconhecimento tipado específico de toda recusa arbitrária do provider comprovado além desse cenário.

## Configuração e dependências exatas antes de ativação
1. Consulta oficial names-only confirmou LOVABLE_API_KEY configurada; nenhum valor lido/derivado e nenhuma chave criada/rodada. Não prova que modelo/endpoint estejam disponíveis, retenção/região/vendor ou saldo permitido.
2. Implementar/rever controlo durável específico de provider/claim/revision/negação e ACL, conforme86-pausa-provider-DESENHO-INERTE.md, testar em PostgreSQL local descartável. Config legada não pode ser reaberta para contornar ACL. Nenhum SQL aplicado nesta entrega.
3. Runtime hospedado: confirmar resolução das versões, permissões/importação e stream/cancelamento quando houver autorização de verificação externa. Bundle/check locais não provam runtime hospedado.
4. Prova externa finita de disponibilidade e contrato, somente após autorização própria para chamada paga; negativa provider/conta/configuração/documented404 termina sem probe alternativo.
5. Análise inicia SSE antes da chamada:403 posterior é evento terminal data-analysis-error status403 sob HTTP200 já enviado, NÃO HTTP403 retroativo. Antes da ativação, controlar negação persistida antes de headers e persistir recusa de acesso durante stream; implementação durável ausente é bloqueio, não certificação completa.
6. Limite6000tokens não é quota financeira. Não há concorrência global servidor implementada; desenho claim global revisável evita Map/framework desnecessários sem prometer orçamento duro. Gate false é única garantia atual de zero chamadas.
7. Controller confirmar GitHub/Lovable sincronizados e CI quality do novo SHA integrado antes próximo dispatch não corretivo/Publish. CI403 da base não certifica esta entrega.
8. Ativação/release9 e três lacunas8 requerem decisões próprias; esta revisão não as dispensa. Nenhum Gmail/Drive/OAuth ou autorização financeiro novo.

## Checklist18fases
- [x]1–7 concluídas pelo histórico anterior, não recertificadas aqui.
- [ ]8 parcial: check pós-revogação, HTTP simultâneo mesma prévia, download separado/SHA pendentes.
- [ ]9 disponibilização restrita não liberada.
- [ ]10 código/análise+verificação técnica LOCAL preparados; controlo durável/runtime hospedado/prova externa pendentes.
- [ ]11 Gmail.
- [ ]12 Drive.
- [ ]13 transações/anexos.
- [ ]14 BP/Formalidade.
- [ ]15 extratos.
- [ ]16 bilheteiras.
- [ ]17 aceitação integrada.
- [ ]18 fecho final.

Limpeza manual Auth/Storage adiada; não repetir81/83. Próxima ação concreta controller: confirmar CI do novo SHA e reservar implementação local do controlo durável proposto, sem ativar9 nem repetir piloto8.