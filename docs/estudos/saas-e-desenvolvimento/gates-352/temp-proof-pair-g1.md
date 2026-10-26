# #352 — par TEMP de 20260925222026 e G1

Data: 26/10/2026. Parecer [6414048882](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6414048882). Sem novas leituras em Live nesta etapa; prova do revisor e export do ledger já disponível. G2 não executado.

[Commit privado 148ac9d8](https://github.com/pedrompropicio/mundopropicio-replay/commit/148ac9d88927627380bea5d5c47a78ddb846a5bc) · [G1 40310507727](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40310507727).

## Predicado e par

Ponto 1 de data_volume_assertion admite escrita apenas na TEMP criada e eliminada pela mesma migração, exclusivamente para a prova. Pontos 2–4 preservados. Aplicação limitada ao par revisto, não a qualquer erro 42501.

Manifesto privado proofs/data-volume-assertions.json, marca **par**, identificador erp144_meta_google_before_after:

| Bloco | Linhas | SHA-256 do bloco completo |
|---|---|---|
| Antes | 8–17 | f0a062789e3e2d70e3810ff2d6962e97a10c696056bf98ffd8be918a7df2e8a9 |
| Depois | 280–303 | 8c77933b229971d0177d05dad2159bfbf2a04342329bbb21891b94a9f1da6fe6 |

A primeira prova escreve somente em _erp144_hash; a segunda lê a TEMP, compara resultados e verifica privilégios. Ambas dependem do artista concreto referido na migração, não semeado no replay. A prova do revisor confirma a presença da versão e do artista em Live.

Validação anterior a qualquer SQL exige os seis statements originais, com hashes exactos: CREATE TEMP (L6), primeiro DO, CREATE OR REPLACE FUNCTION artist_ads_campaigns (L19–192), CREATE OR REPLACE FUNCTION artist_ads_daily (L194–277), segundo DO, DROP (L305). Falta de um membro, alteração de função ou escrita em tabela permanente interrompe a execução. Ambos os DO saltam completos, antes de executar; o restante corre intacto. Nenhum SQL histórico editado, nenhum artista semeado.

Uma verificação na mesma sessão, antes do commit, exige TEMP eliminada e ambas as assinaturas presentes. O checkpoint posterior exige os dois membros registados e a versão confirmada. O manifesto guarda proveniência Live, SHA original/publicado, hashes e linhas dos blocos e statements mantidos.

## Privilégios diferidos

A verificação do segundo bloco (anon sem EXECUTE; authenticated e service_role com EXECUTE) fica explicitamente pendente para a comparação de ACL do **G2 no estado final**, com as assinaturas então existentes. Não foi substituída por um resultado presumido e não foi executada nesta etapa.

## Validação local

**36 testes PASS**: dez do par e 26 de regressão das variantes anteriores de data_volume_assertion. Cobrem salto dos dois membros, preservação dos quatro statements restantes, rejeição de membro ausente, falta de DROP, tabela permanente, DML fora da TEMP, função alterada e origem diferente do ledger.

check-pii 2026-10-26T10:48:16.173608Z: 1.246 ficheiros, zero ocorrências; 899 literais JSON, zero inválidos. Plano mantém 1.465 entradas, mesma ordem; ficheiros históricos e seeds intactos.

## Resultado G1

**Par aprovado validado; G1 vermelho por novo bloqueio.** UTC 10:50:43–10:57:22 de 26/10. **1.197/1.465 entradas concluídas**, 1.198 tentadas, uma falhada e 267 não tentadas.

- **47/47 cidades e 114/114 categorias PASS**, sem diferenças.
- Checkpoint temp-proof-pair-checkpoint.json PASS: membros [1, 2] saltados, versão 20260925222026 confirmada, verificação estrutural na mesma sessão positiva, TEMP ausente, ambas as assinaturas presentes.
- As duas CREATE OR REPLACE FUNCTION e o DROP executaram; não foram substituídos nem saltados. Nenhum artista semeado.
- **70/70 verificações nativas anteriores PASS**, além do novo checkpoint real do par.
- Saltos destrutivos 155; idempotentes 2.137 (base 1.162, policy_equal 611, using_index 175, trigger_equal 169, insert_duplicate_equal 1, txn_control 12, insert_duplicate_superseded_by_ledger 3, grant_revoke_missing_object 4).
- Saltos revistos 7: orphan_dml_without_effect 1, data_volume_assertion 5 (incluindo ambos os membros deste par), platform_role_grant_excluded 1.
- Crons 15→0; agendador desligado; compensação ACL final não alcançada.

**Novo bloqueio para parecer:** ledger/20260925233533_e46e8602-c3fe-45dd-ad77-981b2dcfba99.sql, DO iniciado em **L5**, SQLSTATE **22023**, mensagem “ligação TikTok de artista não encontrada”, em artist_ads_tiktok_manual_upsert.

O novo ficheiro contém outro par, ainda sem prova estática registada no manifesto aprovado: DO L5–21 (SHA-256 9de6fbbcadb44fe3683860178a977b3b17783a12a15248c3200da3e568ce43a1) e DO L200–222 (SHA-256 afa0d08e4b7bfdfa9ce42b76e791f8e906cfc02de8e37dc1add4f65f7ed3a550). Combina chamadas de ingestão dentro de subtransacção com sentinela rollback_probe e utilização de TEMP _tt_eq. Esta combinação e as chamadas merecem validação do predicado completo pelo revisor; não foram automaticamente equiparadas ao par anterior.

A versão falhada foi revertida integralmente. Não foi semeada ligação/artista, alterada função, dividido bloco ou adicionada exceção. Paragem para revisão. **G2 não executado**; ACL das funções do par aprovado permanece pendente para G2.

Artefacto 12643679162; SHA-256 do ZIP conferido: 397bb0bf2205cb8668b88c1678a657ca1a117f47a22738210fa63020a18ecafe.

## Hashes e coordenação

Manifesto data-volume-assertions.json: e0d9e92a01204b299e698d43fca7d7151fba1106743ecfe2eb387bb88ffc1374.
Plano: 2962a9c73b575f3dd8323c07160cc9cdf27e3f88d9ea2fce886ff0b9dfd4685c.

#329: aguardada sincronização; em 2026-10-26T10:50:12.316Z, GitHub público = Lovable = c3bed1231217dbb5af923172a266488fc7ac6b9d e agentFinished=true. Push privado CAS sem força, anterior c0197257. Reconfirmação documental registada no comentário da Issue.

Reserva #352 mantém-se até fecho do gate; QUADRO/estado para Claude Code; Issue aberta. Sem escrita em Live, novos dados de produção, criação de papéis, infraestrutura paga, deploy ou Publish.
