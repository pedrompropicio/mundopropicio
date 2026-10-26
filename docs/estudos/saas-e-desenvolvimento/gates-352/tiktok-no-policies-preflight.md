# #352 — condição de paragem confirmada na Drizzle 0010

Data: 26/10/2026. Parecer [6415540166](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6415540166).

## Resultado da leitura

A condição expressa de paragem do despacho verifica-se: **a 0010 exige políticas com nomes concretos já existentes**. O bloco não consulta pg_policies nem itera sobre zero políticas: percorre uma lista fixa de tabelas.

Fonte: [0010_derp168_artist_rls_empresa_do_artista.sql no checkout fixado](https://github.com/pedrompropicio/mundopropicio/blob/ad160ee9fbc5b7c5a73f0a63fc44b0c1c86a2708/drizzle/migrations/0010_derp168_artist_rls_empresa_do_artista.sql), confirmada por leitura GitHub e local. SHA-256: fca3929d4583ff4af35c59b9d3d9dee87ca40f5593f3e421bc0faad7bb48a1c7.

- L45–46: lista fixa inclui as três tabelas TikTok.
- L47: DROP POLICY dinâmico do nome formado por tabela + sufixo _write, sem IF EXISTS.
- L48: só depois desse DROP cria a política.
- L49: DROP POLICY do nome formado por company_isolation_ + tabela, também sem IF EXISTS.
- L50: só depois desse DROP cria a política.

| Tabela | Política exigida em L47 | Política exigida em L49 |
|---|---|---|
| artist_song_tiktok_groups | artist_song_tiktok_groups_write | company_isolation_artist_song_tiktok_groups |
| artist_song_tiktok_sound_daily | artist_song_tiktok_sound_daily_write | company_isolation_artist_song_tiktok_sound_daily |
| artist_song_tiktok_sounds | artist_song_tiktok_sounds_write | company_isolation_artist_song_tiktok_sounds |

Com as tabelas criadas sem políticas, a primeira destas chamadas não teria objecto para apagar. **Conclusão por leitura do SQL; não é resultado de um novo run.** Não se alterou o DO, não se acrescentou IF EXISTS e não se criou política auxiliar.

## Verificações realizadas

Catálogo das três relações relido por SELECT em Live: OIDs 249629, 250004 e 250043; respectivamente 9, 16 e 9 colunas; 5, 7 e 4 constraints. Todas têm RLS activo e FORCE desactivado. Nenhuma linha operacional foi consultada ou copiada. A leitura local do plano não encontrou CREATE/ALTER dessas tabelas nos ficheiros ledger/orphan e apenas referências de políticas nas Drizzle 0010, 0125 e 0146.

A reconstrução sem políticas não foi materializada nem publicada, porque a incompatibilidade foi identificada antes da implementação. Scripts manuais não executados. Plano, runner, reconstruções, seeds e SQL histórico permanecem inalterados.

## Estado e devolução

**G1 não repetido nesta etapa:** paragem expressa do parecer. O último run continua [40316514693](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40316514693), com 1.234/1.466 entradas concluídas e checkpoints 47/47 e 114/114 PASS. Estes resultados são do run anterior, não uma nova validação.

**G2 não executado.** Devolvido ao revisor para decidir o tratamento dos seis DROP POLICY obrigatórios dentro do DO. Nenhuma solução alternativa aplicada.

Fecho documental apenas neste ficheiro novo e comentário na #352. Reserva mantém-se; QUADRO/estado ficam para Claude Code. #329 reconfirmado antes do push, com SHA e hora registados no comentário. Sem escrita em Live, DSN, infra paga, deploy ou Publish.
