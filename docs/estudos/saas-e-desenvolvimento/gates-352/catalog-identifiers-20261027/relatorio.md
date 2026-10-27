# #352 — catalog_identifier_literal: aplicado; lote de sanitização pendente

Data: 27/10/2026. Parecer lido: 6441951637. Continuidade: 6441578437, 6433564033 e 6431939022.

## Estado e trabalho preparado

A prova por SELECT confirmou correspondência exacta dos literais das políticas 63708 e 109889 com storage.buckets.id (12:33:31 UTC). A regra foi implementada localmente com prova por hash, objecto e fonte; não usa coincidências parciais. Na verificação de PII, cobriu ainda sete ocorrências de identificadores, comprovadas por SELECT. Os nove literais da allowlist anterior continuam restritos aos hashes, funções e linhas aprovados.

O plano local tem 1.545 entradas históricas (711 Supabase, 499 órfãos, 281 Drizzle, mais os seeds/reconstruções já autorizados). Nenhum novo seed. Foram preparadas 163 operações DDL na etapa final R1/R2, ordenadas pelas dependências de pg_depend, depois de separar três índices geridos por constraints. R3 tem oito operações de retirada de associação à extensão pgmq, sem apagar as tabelas. O overlay de enum mantém 21 instruções em 17 ficheiros, com origem dos 12 valores.

O runner local foi preparado para a prova nativa isolada do enum, a comparação final exacta de enumsortorder e a execução da etapa final antes da compensação de ACL. Seis testes Python da regra de identificadores e dez de regressão da sanitização passaram. As validações locais dos manifestos de enum e tail passaram. **Não são resultados de G1 nativo.**

## Paragem antes de publicar código ou executar G1

Scanner: 1.493 ficheiros SQL; 982 literais JSON verificados, zero erros JSON. Depois das sete admissões de catálogo: 22 ocorrências pendentes — um telefone, um candidato a IBAN e 20 candidatos de texto livre. Os candidatos de texto livre não são classificados como nomes de pessoas; precisam de classificação para manter o scanner fechado.

A correspondência exacta nas sete fontes autorizadas foi testada por SELECT. Nenhum dos 22 restantes ficou coberto. O candidato a IBAN é apenas um trecho de uma string SQL maior no corpo da função; o literal completo também não tem correspondência, e a regra exclui coincidência parcial. Não se afirma que o telefone/IBAN sejam reais: podem ser valores técnicos/de teste, mas isso não foi autorizado como classe.

| Objecto | Linha da cópia preparada | Tipo do scanner | SHA-256 do candidato |
|---|---:|---|---|
| public.system_reminder_settings.default_twilio_from | 1 | telefone | 042a05801b4d8c8cf4c7b2d6ea9267b69d015c83818627876956074f46882499 |
| public._revert_event_to_version(pg_catalog.uuid,pg_catalog.uuid,pg_catalog.uuid,pg_catalog.text,pg_catalog.bool) | 112 | nome_em_texto_livre_candidato | 8d4f0acb2ab59d699b23cefe96b7b75ede3331818a47d417f5053d05ad3916f4 |
| public.apply_supplier_credit(pg_catalog.uuid,pg_catalog.uuid,pg_catalog."numeric",pg_catalog.uuid) | 59 | nome_em_texto_livre_candidato | d30fadcd911ee6d3b9d8dd324034825cce297542d7306cfd1fc7d490c9d668f6 |
| public.auto_create_initial_bp_version() | 34 | nome_em_texto_livre_candidato | 7dc184603e316e8c99570e9de63270ee0556bb8738b524bef82fa105c4253171 |
| public.auto_create_retroactive_split_snapshots() | 26 | nome_em_texto_livre_candidato | ad8245a3e9671711e7b3feaa1c75f055740806efa09907d1c7561990a5ee12f3 |
| public.card_load_on_out_paid() | 41 | nome_em_texto_livre_candidato | 1b5f79d39a041008a8d515328e0bf37c119d2bd76cc939c47a90c41fbe2ecf70 |
| public.card_load_on_out_paid() | 41 | nome_em_texto_livre_candidato | a5c311e0c9a6f5927ebfd90f15be6850b4ff7e28c17c0f16cd4c4e42e5fe0e7f |
| public.check_rpc_smoke() | 31 | IBAN | 5bf170f4ee6e8c4bb56675eb95683ef38200dfdea35af7ec98637efc701a5a0e |
| public.create_card_session_load(pg_catalog.uuid,pg_catalog."numeric",pg_catalog.date,pg_catalog.uuid,pg_catalog.text) | 49 | nome_em_texto_livre_candidato | 2180c0237e69b3d1a73a4bb139834a5a3985b30ebf987add4f6ce18958f7d56d |
| public.create_card_session_load(pg_catalog.uuid,pg_catalog."numeric",pg_catalog.date,pg_catalog.uuid,pg_catalog.text) | 49 | nome_em_texto_livre_candidato | a5c311e0c9a6f5927ebfd90f15be6850b4ff7e28c17c0f16cd4c4e42e5fe0e7f |
| public.create_card_session_load(pg_catalog.uuid,pg_catalog."numeric",pg_catalog.date,pg_catalog.uuid,pg_catalog.text) | 49 | nome_em_texto_livre_candidato | a5c311e0c9a6f5927ebfd90f15be6850b4ff7e28c17c0f16cd4c4e42e5fe0e7f |
| public.ensure_camarim_advance_account() | 24 | nome_em_texto_livre_candidato | b32acde9697b57ca675df25fe73d005bd69277de3b8e9d17a336aeb2a89cbe83 |
| public.get_or_create_generic_camarim_supplier(pg_catalog.uuid) | 29 | nome_em_texto_livre_candidato | b7d5dd272afcd4e584e70b66835f14212bb9699399c34cc3e55ed2ccf303c462 |
| public.launch_from_bank_lines(pg_catalog.jsonb) | 176 | nome_em_texto_livre_candidato | 4c7ce25a5b5bb9f34e7aa25bfcd2ff52f36019da17f531550d35540e12aa824f |
| public.materialize_paid_amount_payment() | 39 | nome_em_texto_livre_candidato | 804f98d144e08266918a37f7ecc10d2dcc8a46bdda0bec3d9a0ca7f2eb646c49 |
| public.promote_scenario_to_active(pg_catalog.uuid,pg_catalog.text,pg_catalog.uuid,pg_catalog.text,pg_catalog.bool,pg_catalog.jsonb) | 92 | nome_em_texto_livre_candidato | bfa966aceb8eb778f28c84ff235bf8e572e3295edaa607e6d8c6a8be1e943099 |
| public.promote_scenario_to_active(pg_catalog.uuid,pg_catalog.text,pg_catalog.uuid,pg_catalog.text,pg_catalog.bool,pg_catalog.jsonb) | 358 | nome_em_texto_livre_candidato | 25bd5a15abc8e8195e7963b78ee1f31beb00147c3ca107d2d04bd8525a8175b6 |
| public.sync_partner_aporte_mirror() | 66 | nome_em_texto_livre_candidato | c16fc30d76e16e4448de708254e9c93214df18a06562041e545fad9a00dc775a |
| public.sync_partner_aporte_mirror() | 83 | nome_em_texto_livre_candidato | c16fc30d76e16e4448de708254e9c93214df18a06562041e545fad9a00dc775a |
| public.sync_shared_cost_mirror() | 59 | nome_em_texto_livre_candidato | bebad13fa24c92cec912429ecd45733caea4ee73b19e0c50ee91f9e84676bbf4 |
| public.sync_shared_cost_mirror() | 71 | nome_em_texto_livre_candidato | bebad13fa24c92cec912429ecd45733caea4ee73b19e0c50ee91f9e84676bbf4 |
| public.transactions_active_installment_unique_idx | 2 | nome_em_texto_livre_candidato | bb35f6cd12880f993c2016ba7e3f9c8c9f7176f8a1bb47d3e76f95db5fac17ba |

Detalhe do IBAN: função public.check_rpc_smoke(), oid 188262; candidato com 25 caracteres dentro de literal com 122 caracteres. SHA-256 do literal completo: 9c16bf6ab6f8427493d43b374fe7ccbb7a363a76ef4c3799189fa8501abdf6d8. SELECT às 12:45:22 UTC: nenhuma correspondência nas fontes autorizadas.

Detalhe do telefone: default de public.system_reminder_settings.default_twilio_from, relação oid 60701, attnum 3. Não há correspondência exacta nas fontes autorizadas.

## Pedido ao revisor

Classificar o lote completo: admitir por hash/objecto/posição os valores comprovadamente técnicos, ou definir a substituição sintética a aplicar aos valores que precisem de redacção nas cópias do catálogo. Não foi ampliada a allowlist, não foi reduzido o scanner, não foram retirados objectos do plano e não se alteraram originais.

## Gates e coordenação

G1 não executado neste ciclo; G2 não executado. N9 e a comparação N1–N9 permanecem pendentes. Os 448 residuais continuam a ser a última medição, não foram recalculados. Nenhum código/SQL deste ciclo publicado no privado. O main privado continua em d3c006118d89bf8c7a5b1b1c643df2866a55e52a.

A reserva mantém-se. QUADRO/estado não alterados. Live só SELECT de catálogo, fontes de identificadores expressamente autorizadas e ledgers. Sem escrita em Live, dados de aplicação novos, infra, deploy ou Publish. #329 reconfirmada antes do push documental.

Hashes da preparação local:

- plan.json: 8dc92deea2f8e101044ceb6f80ab7da4603560dbb675f01f2c2cb23986545085
- enum-position.json: 72a8139e00450c10c4e0ff4b72c25629285946d1073c2adf8373b3d6ba083f3e
- supabase/baseline/live-only/manifest.json: 9c33e2937f7e7942b0407c50aa4ae37aa74e8d287c97692b798d0874d254ef9c
- catalog-identifier-proof.json: 9eaf68cceb5dfdd081378cfe2fc30bfb7a371eae45d80929b45e6ba8af8d9dbb
- proofs/catalog-identifier-pii.json: 22c2b4849d0dd0301e02995b0f1c57122f7c13e3c0f29ee22d656e3beade934c
