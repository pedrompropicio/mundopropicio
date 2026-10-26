# #352 — par TikTok e classificação dentro do predicado existente

Data: 26/10/2026. [Parecer 6414399543](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6414399543). [Commit privado 158dfecd](https://github.com/pedrompropicio/mundopropicio-replay/commit/158dfecd4e18c353d574625a3bfaeb4e47bd07b1). [G1 40312886375](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40312886375).

## Aplicação e prova

20260925233533 enquadrada nos quatro pontos existentes de data_volume_assertion, sem alargamento. Os dois DO chamam a ingestão numa subtransacção cuja saída normal é a sentinela rollback_probe, com handler que relança qualquer outra exceção. Escrita fora dela limitada à TEMP _tt_eq, criada pela própria migração com ON COMMIT DROP.

Prova por SELECT em Live: **ledger_count=1 e identifier_count=1**, limitando a segunda contagem à ligação TikTok com scope artist. Query, hora UTC e resultado guardados no privado em proofs/tiktok-pair-live-select.json; nenhuma linha operacional copiada. Proveniência do SQL ligada ao export do ledger.

| Membro | Linhas | SHA-256 | Sentinela / handler |
|---|---|---|---|
| Antes | 5–21 | 9de6fbbcadb44fe3683860178a977b3b17783a12a15248c3200da3e568ce43a1 | L16 / L17–19 |
| Depois | 200–222 | afa0d08e4b7bfdfa9ce42b76e791f8e906cfc02de8e37dc1add4f65f7ed3a550 | L211 / L212–214 |

Manifesto com marca **par**, identificador erp144_tiktok_before_after, sentinela rollback_probe, linhas, hashes e prova SELECT. Os sete statements completos estão ligados por hash; saltam apenas os dois DO juntos. CREATE TEMP, duas funções, REVOKE e GRANT executam normalmente. Verificação na mesma sessão após COMMIT exige TEMP eliminada e ambas as assinaturas presentes.

Os grants de crm.tiktok_manual_upsert_core ficam para a comparação final de ACL do G2. **G2 não executado**.

## Autonomia e limites

Conforme autorização, novos casos que cumpram os quatro pontos são classificados pelo Codex sem pedir parecer adicional, com prova SELECT da versão no ledger e existência do identificador de produção, análise estática e registo de hashes/linhas. O runner não ignora erros genericamente: exige evidência e reconhecimento exacto dos blocos e do contexto. Só alargamento de predicado ou outra regra volta ao revisor.

## Validação

**46 testes locais PASS**: dez do par TikTok, dez do par TEMP anterior e 26 de regressão. Testes negativos rejeitam membro ausente, handler/sentinela alterados, ausência de ON COMMIT DROP, tabela permanente e mudança de grant. check-pii em 2026-10-26T11:07:51.689033Z: 1.246 ficheiros, zero ocorrências; 899 literais JSON, zero inválidos. Plano com 1.465 entradas, mesma ordem. SQL histórico e seeds intactos.

## Resultado G1

**Par TikTok PASS; G1 vermelho por dependência estrutural ausente.** UTC 11:09:35–11:16:58 de 26/10. **1.221/1.465 entradas concluídas**, 1.222 tentadas, uma falhada e 243 não tentadas.

- **47/47 cidades e 114/114 categorias PASS**, sem diferenças.
- Checkpoint TikTok PASS: membros [1,2] saltados, versão confirmada e verificação na mesma sessão após COMMIT positiva. CREATE TEMP, duas funções, REVOKE e GRANT executaram; TEMP eliminada por ON COMMIT DROP.
- 70/70 verificações nativas anteriores PASS. Par TEMP anterior preservado.
- Saltos destrutivos 155; idempotentes 2.137 (base 1.162, policy_equal 611, using_index 175, trigger_equal 169, insert_duplicate_equal 1, txn_control 12, insert_duplicate_superseded_by_ledger 3, grant_revoke_missing_object 4).
- Saltos revistos 9: orphan_dml_without_effect 1, data_volume_assertion 7, platform_role_grant_excluded 1.
- Crons 16→0; agendador desligado; compensação ACL final não alcançada.

**Bloqueio fora de data_volume_assertion:** ledger/20261002120740_6be30c36-594d-4678-9477-1a3b995136ac.sql, CREATE OR REPLACE FUNCTION public._run_invariant_checks_all() iniciado em **L304**, referência em **L315**, SQLSTATE **42883**: public._run_invariant_checks_extrato() inexistente no replay. A versão foi revertida integralmente.

Isto é DDL construtivo dependente de outra função, não um bloco de prova de volume/identificador. A regra de GRANT/REVOKE para objecto ausente também não se aplica. Não se pode saltar a criação, remover o ramo UNION ou inventar um corpo.

A busca em ledger, órfãos e fontes Supabase/Drizzle não encontrou CREATE desta função, apenas referências. SELECT de catálogo às 2026-10-26T11:18:38.945Z: a função existe em Live, oid 254372, assinatura sem argumentos, plpgsql, SECURITY DEFINER, retorno tabular de nove colunas; zero CREATE correspondentes no ledger. Digest MD5 da definição actual: 1e0180e718e25377bbf980c36c154e87. Não se exportou nem executou o corpo.

**Paragem por necessidade de regra/proveniência adicional para reconstruir uma função ausente**, não por nova ocorrência do predicado de dados. As autorizações anteriores de reconstrução tratam relações/colunas; não se presume que a definição actual de uma função corresponda à necessária nessa posição histórica. Caso devolvido ao revisor. Nenhum dado semeado nem SQL histórico alterado. **G2 não executado.**

Artefacto 12645777584; SHA-256 do ZIP conferido: 38bca2f1e222dba071b560555082cdeb3e05d1c9d951ce8ba73780cd0026c262.

## Hashes e coordenação

- Manifesto de data_volume_assertion: 79538abf2c20e6ab9a4b5411d26f9edd9d46824d934c4fcf6f5aa849c3bd665f.
- Prova SELECT: ca9d7b41e8e11d24c89dd2cfce3f86ad0bd2c61f8123171191d4659e5f6cea0e.
- Plano: ca5683b44857075a7bedb30b8e5520203d395467649505bb7ed78a51996c94c3.

#329 antes do push privado: 2026-10-26T11:08:54.229Z, GitHub público = Lovable = aad30f63fd644911647ff57d571e255dfacdd060, agentFinished=true. Push CAS sem força, privado anterior 148ac9d8. Reconfirmação documental registada na Issue.

Reserva mantém-se até fecho do gate; QUADRO/estado para Claude Code; Issue aberta. Live somente SELECT, sem criação de dados operacionais, papéis, infraestrutura paga, deploy ou Publish.
