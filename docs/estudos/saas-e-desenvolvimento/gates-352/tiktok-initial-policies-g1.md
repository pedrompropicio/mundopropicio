# #352 — tabelas TikTok e políticas iniciais corroboradas por Live

Data: 26/10/2026. Parecer [6416092001](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6416092001), que substitui 6415540166. [Commit privado 8979b7a8](https://github.com/pedrompropicio/mundopropicio-replay/commit/8979b7a8921a59775cdf24c281840242b5460d5f) · [Run G1 40324678934](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40324678934).

## Implementação e prova

Catálogo relido por SELECT em 2026-10-26T12:34:32.343Z. Reconstruídas as três tabelas, com colunas, constraints, índices, grants sem papéis de plataforma, triggers e RLS activo/FORCE falso. Os nomes só aparecem no plano nas políticas Drizzle 0010/0125/0146: nenhum ALTER posterior acrescenta colunas; não houve colunas diferidas.

| Tabela public | OID | effective_at UTC | Colunas | Constraints | Triggers |
|---|---:|---|---:|---:|---:|
| artist_song_tiktok_groups | 249629 | 21/09/2026 18:02:24 | 9 | 5 | 1 |
| artist_song_tiktok_sounds | 250004 | 21/09/2026 18:02:25 | 16 | 7 | 1 |
| artist_song_tiktok_sound_daily | 250043 | 21/09/2026 18:02:26 | 9 | 4 | 0 |

Janela: depois de 20260921180223, função vizinha oid248896; antes de 20260922051848, função vizinha oid251436. SELECT confirmou ambas as definições e zero CREATE no ledger para cada tabela. Ordem natural pelos OIDs.

Logo após cada criação, aplicadas exclusivamente as instruções de política extraídas, byte a byte, dos scripts do checkout fixado ad160ee9fbc5b7c5a73f0a63fc44b0c1c86a2708:

| Script manual | Linhas inclusivas | Tabela | Instruções |
|---|---|---|---:|
| 20260921195500_artist_song_tiktok_groups.sql | 35–64 | groups | 6 |
| 20260921205000_artist_song_tiktok_sounds_module_a.sql | 48–77 | sounds | 6 |
| 20260921205000_artist_song_tiktok_sounds_module_a.sql | 108–137 | sound_daily | 6 |

São nove DROP POLICY IF EXISTS e nove CREATE POLICY. Nenhum CREATE TABLE, ALTER de artist_songs ou DML dos scripts foi executado. Os triggers vêm do catálogo.

SELECT confirmou uma entrada Drizzle com o hash exacto da 0010 aplicada em Live. As três políticas _select actuais são PERMISSIVE, SELECT, authenticated, USING true, iguais aos scripts. Manifesto privado reconstructed/tiktok-manifest.json com a marca **política de script manual corroborada por Live**, query/UTC, OIDs, janela, ficheiros/linhas e SHA-256 dos blocos e de cada instrução. O catálogo actual mantém-se como referência para G2, não como políticas iniciais.

row_belongs_to_current_company(uuid) já é criada pelo **órfão 20260429022451 L66** no plano. Não foi reconstruída nem antecipada. A presença foi confirmada nos três checkpoints nativos. Drizzle 0010, 0125 e 0146 sem qualquer alteração.

## Validação e G1

Nove testes locais PASS, incluindo extracção exclusiva de políticas, rejeição de intervalo adulterado, ordem temporal, triggers preservados, RLS e ausência de políticas futuras. check-pii: 2026-10-26T12:37:28.511100Z, **1.253 ficheiros, zero ocorrências, 907 literais JSON válidos**.

G1 desde vazio, 26/10/2026, UTC 12:43:33–12:51:41:
- **1.239/1.469 entradas concluídas**, 1.240 tentadas, uma falhada, 229 não tentadas.
- Todas as 711 ledger e 499 órfãos concluídas; 12 entradas Drizzle concluídas.
- **Três checkpoints TikTok PASS**, zero diferenças estruturais/ACL, três políticas iniciais por tabela, helper existente.
- **Drizzle 0010 e 0011 PASS**. O bloqueio anterior dos DROP POLICY foi resolvido.
- **47/47 e 114/114 PASS**, zero diferenças.
- 70/70 verificações nativas anteriores PASS.
- Crons 16→0; agendador permaneceu desligado.

Saltos: destrutivos 155; idempotentes 2.137; revistos 9. Idempotentes por variante: base 1.162, policy_equal 611, using_index 175, trigger_equal 169, insert_duplicate_equal 1, txn_control 12, insert_duplicate_superseded_by_ledger 3, grant_revoke_missing_object 4. Revistos: data_volume_assertion 7, orphan_dml_without_effect 1, platform_role_grant_excluded 1. Nenhuma regra de salto alargada.

## Primeira falha e limite novo

**Drizzle id13, 0012_derp172_view_by_state_artist_only.sql, L2, SQLSTATE 42703**: a view v_artist_audience_by_state refere d.song_id, ausente em public.artist_audience_demographics. Migração revertida, original intacto.

Investigação por SELECT e leitura:
- Live tem song_id, attnum14, uuid, nullable, sem default; FK artist_audience_demographics_song_id_fkey para artist_songs(id), ON DELETE CASCADE; índice parcial idx_aad_song.
- Nenhum ALTER correspondente foi encontrado no ledger/orphan/Drizzle.
- supabase/manual/20261005_derp172_song_geo_chat2.sql L1–7 regista aplicação em Live em 05/10, contém ADD COLUMN/FK/índice e anota também a mudança de unicidade. Foi apenas lido.
- Ledger **20260911194814 L106–107** cria uq_artist_audience_demographics como UNIQUE de seis colunas.
- Live tem **a mesma constraint nominal**, agora UNIQUE NULLS NOT DISTINCT de sete colunas, acrescentando song_id; oid333771. O índice homónimo é gerido pela constraint.

**Limite que exige parecer adicional:** a reconstrução de coluna, FK e índice está coberta, mas reproduzir a definição actual completa exige também substituir uma constraint já existente, com mudança de colunas e da semântica de NULL. Acrescentar apenas a coluna deixaria essa divergência; ADD CONSTRAINT com o mesmo nome colidiria e o salto de duplicado não a corrigiria. Não foi aplicada substituição nem omissão da constraint. Devolve-se ao revisor o tratamento exacto da transição de unicidade, para não alargar silenciosamente a regra de objectos ausentes.

G1 permanece vermelho nessa primeira falha. **G2 não executado**; Drizzle 0125/0146 ainda não alcançadas. A igualdade final das políticas/RLS/ACL TikTok com Live continua pendente de G2 autorizado.

## Hashes e coordenação

- Bloco groups: 97960cd430f269c5280cec4a42c5112750c0d997c0030a56bcb72fb10d69b123.
- Bloco sounds: 8a72340fedfb3c3e01f5e19d3c8ea1f6e7d68ae206c5a1a5b3aea9dcb7321ef1.
- Bloco sound_daily: 01c982f6cebedc50a5898045edfe4e3ca05f4c558e6a50d66827f281749a3eee.
- Manifesto: 9b0c8b1290a90a508f7f0fbfbb3fa7a7edc4c05e46b5ad35584eb6c912585088.
- Plano: 80ba7353cfb98407328028bcaed9a8210522d61e9688d4f34473d31282d84695.
- Artefacto 12651415778, ZIP SHA-256 verificado: abe5b636e228d3cfa55b1b181e5a530ccdbf6d952eaef0c8461db429e76dca69.

#329 privado: 2026-10-26T12:42:59.061Z, GitHub=Lovable=ccb8743f5fcf5ba8a6befafab5d7df24356284f1, agentFinished=true; push CAS sem força. Reconfirmação documental registada na Issue. Publicação pública apenas deste ficheiro novo e comentário. Reserva mantém-se; QUADRO/estado ficam para Claude Code. Issue aberta. Live só SELECT; sem dados operacionais copiados, DSN, infra paga, deploy ou Publish.
