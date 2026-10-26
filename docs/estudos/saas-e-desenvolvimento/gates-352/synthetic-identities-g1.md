# #352 — gémeos sintéticos distintos e papéis compatíveis

26/10/2026. Executor: Codex. Parecer/autorização: [6407271840](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6407271840), na sequência de 6407103995 e da continuação expressa do Pedro. R0 exclusivamente no replay privado; Live apenas SELECT de texto do enum de papéis. Nenhuma escrita em Live, conta externa, deploy ou Publish.

## Resultado

**G1 vermelho; G2 não executado.** A colisão de identidades foi corrigida. O novo bloqueio é uma contagem histórica de dados operacionais, na mesma versão: `20260913132000`, bloco DO iniciado na linha 83, RAISE na linha 109, SQLSTATE `P0001`, objecto `public.events`: esperado 52, observado 0 sob o contexto staff simulado. Esta evidência mede linhas visíveis nesse contexto; não é uma contagem independente como postgres. Não foi criada nova regra de salto nem copiado qualquer evento.

- Plano: 1.464 entradas; 1.068 concluídas, 1 falhada, 395 não tentadas.
- Checkpoint de categorias `20260430033938`: **114/114**, zero diferenças.
- Checkpoint de cidades antes de `20260913132000`: **47/47**, zero diferenças.
- Testes nativos: **53/53 PASS**, incluindo estabilidade/distinção do mapeamento e duas identidades distintas em `auth.uid()`.
- Testes locais específicos da sanitização/mapeamento: **16/16 PASS**.
- PII: **1.242 ficheiros SQL, zero ocorrências, zero JSON inválido**; hashes e JSON das 1.464 entradas validados antes do replay.
- Crons: 12 exportados com comandos redigidos; 0 após unschedule local; agendador desligado durante o replay. Compensação final de ACL ainda não alcançada.

## Alteração e limites da prova

Mapeamento determinístico por HMAC-SHA256 com sal guardado apenas no repositório privado, fora de relatórios e artefactos. Três identidades originais distintas têm três UUIDs sintéticos distintos. Foram corrigidas quatro cópias de testes de identidade: versões `20260913132000`, `20260913134707`, `20260913140128` e `20260925222026`; hashes originais preservados no manifesto. Nenhuma referência de negócio foi substituída por esta correcção.

SELECT de papéis em Live em **2026-10-26T03:11:08.449Z**, sem nomes, emails, dados de perfil ou company_id. Os papéis são compatíveis com os testes históricos. O manifesto privado regista apenas UUID sintético, papéis, versões e a prova «teste histórico passou em Live + papel actual compatível». Uma terceira identidade apareceu no teste posterior e recebeu o mesmo tratamento.

Duas entradas de seed foram preparadas, imediatamente antes dos respectivos primeiros usos. A primeira concluiu e criou dois gémeos, com verificação dos papéis; a segunda, destinada ao terceiro gémeo, não foi alcançada. O trigger local existente cria o perfil mínimo e a associação local por omissão; não se copiou perfil ou associação de Live. O teste histórico de isolamento do parceiro, posterior ao ponto de falha no mesmo DO, **não foi alcançado**.

## Saltos mantidos

155 destrutivos; 2.133 idempotentes: 1.161 base, 610 policy_equal, 175 using_index, 169 trigger_equal, 1 insert_duplicate_equal, 10 txn_control, 3 insert_duplicate_superseded_by_ledger e 4 grant_revoke_missing_object. Mais 1 salto revisto orphan_dml_without_effect. Ficheiros privados: `ledger/skipped-destructive.json`, `ledger/skipped-idempotent.json` e `ledger/skipped-reviewed.json`, no artefacto do run.

## Evidências

- [Commit privado d3fbab48](https://github.com/pedrompropicio/mundopropicio-replay/commit/d3fbab48a487d171d098dcc84d3861ca7bbb3164).
- [Run 40263787741](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40263787741), de **03:23:09 a 03:30:23 UTC**; artefacto `schema-replay-352`, id `12626100319`.
- SHA-256 do ZIP, reconferido após download: `53b539f5203dba10325064afaeefe41ffeca2cba4299b6773792b19810af4129`.
- SHA-256 do plano: `22ec4f8a7beb836044eddd52d5dc93a82cc15c41003ba8bd6c6b02fb9c63480e`.
- SHA-256 do mapa de identidades: `368bd540a25a238a0067b09ab604d6f7f608d86f5403aef244d2f67812245eed`.
- SHA-256 do manifesto de identidades: `44a2961e36bb45a97d0fe107b86defac61ae7d71a7cb649e582e20f94e706746`.
- Proveniência e mapa: `proofs/synthetic-identity-manifest.json` e `proofs/synthetic-identities.json`, apenas no privado.

## Pendente para revisão

A migração contém um teste de não regressão com contagens operacionais de Live. O primeiro bloqueio observado agora é o baseline de 52 eventos. É necessário parecer sobre esse teste antes de qualquer alteração; nenhum baseline foi reduzido ou ignorado. G2 permanece condicionado a G1 verde.

#329 foi reconfirmada antes do push privado: GitHub main = Lovable = `06fadebb519dcc68fde65c836904996f803f26c6`, agentFinished=true, às 03:22:40 UTC. A reserva #352 mantém-se até ao fecho do gate. QUADRO e estado-plataforma-e-infra.md ficam com o Claude Code, conforme despacho; não foram escritos pelo Codex. Issue #352 aberta.
