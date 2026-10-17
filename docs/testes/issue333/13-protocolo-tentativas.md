# #333 — reserva persistente candidata; NÃO aplicar

Base revista: 5ac214e5e93c8fe29accc477b59c5020de8a6e79. Executor único, sem subagentes. Apenas patch/manual/testes locais; #323 intacta.

## Identidade e intenção

- Reserva servidor: empresa canónica + principal autenticado + operação + hash SHA256 do envelope canónico SQL (payload, documento, efeitos, alvo e versão anterior na edição). ID cliente opcional, nunca autoridade.
- Mesma tentativa/conteúdo: mesmo ID e destino entre abas/dispositivos do mesmo utilizador. ID alterado com envelope igual encontra a reserva anterior; não cria outra fatura, inclusive completed. Mesmo ID com payload/documento/empresa/utilizador diferente é recusado.
- NÃO há unicidade global de PDF nem normalização ampla. Um PDF pode representar várias faturas: envelopes diferentes coexistem. Envelope integral idêntico mas intenção realmente distinta exige revisão, NÃO inferência de UUID novo. Candidatura não aplica esta decisão ao ERP.
- Ingestão sem ID mantém assinatura/permissões/FX, explicitamente legacy_untracked. Equivalência forte não constitui controlo persistente para chaves incompletas de clientes anteriores. Aplicação bloqueada até rollout/reconciliação. Não impor NIF/número.
- Service-role tem principal técnico ingest_service; created_by do corpo nunca é identidade autenticada. Scanner/edição: auth.uid/current_company_id. #333: data_entry_actor. Outro utilizador não assume reserva; delegação futura específica. Dispositivos do MESMO utilizador funcionam.

## Estados e fronteiras

prepare → authorized → inprogress → completed; review terminal. Unknown é observação de transporte de authorized/inprogress, não autorização. Identidade/conteúdo imutáveis, transições monotónicas. Sem lease/cron/DELETE/expiração que repita efeitos.

Prepare persiste intenção antes de upload. Autorizar vincula hash servidor. Caminho company/attempt333/attemptUUID/documentSHA.ext. Upload só depois do claim autorizado; readback bytes/tamanho/hash antes de recibo service-only. Candidatos nunca apagados.

Begin persiste inprogress antes da mutation. Mutation+completion+audit atómicos sob lock da tentativa e linha UPDATE. Falha antes da auditoria reverte ambos. Recuperação MESMO ID só sob MESMO lock: ausência de destino prealocado/auditoria (INSERT), ou igualdade exata de versão anterior (UPDATE). É prova do protocolo, não ausência de efeitos de clientes não participantes. Completed só confere dados/bytes atuais; nunca mutation nova. Estado processado legítimo separado do original.

RPCs tipados/whitelist, sem SQL genérico. Tabelas fechadas; grants service-only, RPCs autenticados verificam identidade canónica/papéis por operação; service RPCs exclusivamente service_role. Comparar políticas/corpos reais é gate antes de aplicar; fixtures não provam Cloud. Nenhum helper global alterado.

## Decisões indispensáveis antes de aplicação

1. Sem NIF/número, mesmos bytes/campos: reenvio vs duas faturas legítimas num PDF indistinguíveis. Recomendação revisão persistente explícita para intenção adicional; alternativa referência de negócio estável. Não ativar nesta preparação.
2. Clientes anteriores sem ID: recomendação rollout versionado/adapters e reconciliação de anteriores; alternativa ramo antigo rotulado sem cobertura, nunca idemglobal. Não quebrar assinatura nem exigir NIF/número.
3. Outro utilizador autorizado: recomendação delegação auditada específica futura; agora owner autenticado/principal técnico apenas, sem transferência implícita.

## Provas exigidas

SQL real PostgreSQL descartável/pgcrypto/duas ligações; UI/endpoint patchados juntos com Auth/FX/storage fakes. Helpers não substituem estas provas. Storage fake não prova ACL Cloud; versões runtime/npm Cloud pendentes. Sem rede externa/credenciais/objetos Live/deploy/Publish.