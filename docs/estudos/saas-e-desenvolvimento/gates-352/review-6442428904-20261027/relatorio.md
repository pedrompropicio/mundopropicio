# #352 — parecer 6442428904: G1 verde; G2 com 131 residuais

27/10/2026, UTC. Executor: Codex. Reserva mantida; issue aberta. Live consultado exclusivamente por SELECT de catálogo e ledgers.

## Resultado verificável

- [Run 40515742524](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40515742524): sucesso, iniciado às 13:51:47 UTC; replay concluído às 14:02:02 UTC. 1.547 entradas históricas, 165 operações finais R1/R2 e 8 retiradas de associação ao pgmq, sem apagar tabelas.
- Checkpoints 47/47 e 114/114; 12 valores e enumsortorder exacto de app_role; compensação dos GRANT/REVOKE saltados aprovada; contrato dos manuais #335 com 286 objectos e zero diferenças. 31 testes de regressão passaram.
- Scanner: 1.495 ficheiros SQL, zero ocorrências; 982 literais JSON, zero erros. Admitidos os 20 candidatos exactos e as 2 substituições fechadas do parecer. Nenhum literal original neste relatório.
- Fonte pública `2f1e270ab20603dcf6732ea19a264ee2298e570f`; executor privado `b2de7f5361304746cb970a51bc3ecbe00c3628d1`; 711 versões Supabase e 283 entradas Drizzle, incluindo 0281. Plan SHA-256 `01befc6a23539c82682c49b4cbb180725bac41215d8e0d3cd664c9866d6f76ac`.
- [Artefacto privado](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40515742524/artifacts/12738858639), SHA-256 `07ccd6109f3bdbb13882d7d8a90fdccd56979e56b73e01d16f4965469cbd52b8`.
- G2: 25 categorias verificadas por fingerprint; catálogo e ledgers estáveis nos dois extremos da recolha posterior ao G1. As 131 diferenças estão integralmente classificadas: (a) 19 só em Live sem origem encontrada, (b) 84 propriedades, (c) 28 só no replay; zero sem classe.

## Paragem que exige parecer

Os 28 registos só no replay incluem três sobrecargas de funções de publicidade e respectivas ACL, smart_link_url e a sua constraint, índices, políticas e triggers. R1/R2 não autorizam apagar estes objectos; ficaram intactos. A lista exacta está em [residuais.json](residuais.json), grupo (c).

Também permanecem: nulidade diferente de `public.email_send_log.company_id` e `public.song_links.song_id` (NOT NULL no replay, nullable em Live), e `storage.idx_objects_bucket_id_name_lower` válido no replay mas inválido em Live. Não se tentou fabricar um índice inválido, remover colunas ou alargar uma regra.

Os 131 são o conjunto residual medido, não 131 pedidos de regra nova. A tabela `public.bkp_359_whatsapp_legado_coala` e os seus objectos associados são candidatos R1 (só estrutura, nunca linhas); a diferença do predicado `club_member_email_consents_version_check` é candidata R2. Estes candidatos estão assinalados para continuação pelas regras existentes; a paragem actual decorre dos objectos só no replay. ACL de Storage, default ACL, papéis e triggers internos constam da lista, sem exclusão adicional presumida.

## Normalizações e ordem de colunas

| Etapa | Antes | Depois |
|---|---:|---:|
| N1 | 8639 | 2043 |
| N2 | 2043 | 1185 |
| N3 | 1185 | 955 |
| N4 | 955 | 169 |
| N5 | 169 | 169 |
| N6 | 169 | 169 |
| N7 | 169 | 168 |
| N8 | 168 | 165 |
| N9 | 165 | 131 |

N9 retirou 34 diferenças em 8 tabelas: `public.artist_audience_demographics`, `public.camarim_items`, `public.coala_sync_row_state`, `public.company_invitations`, `public.event_ab_config`, `public.event_ab_zones`, `public.event_simulator_cost_lines`, `public.fever_sync_config`. Em 11 outras tabelas há ocorrências que exigem verificar uso posicional; foram mantidas conservadoramente. Isto não afirma que todo SELECT-star encontrado seja usado por posição. Existem ainda colunas que não satisfazem o requisito de conjunto/propriedades iguais. No total residual, 77 diferenças são de ordem lógica. Provas por ficheiro, linha e hash em [n9-tabelas.json](n9-tabelas.json).

## Famílias residuais

| Família | Diferenças | Objectos |
|---|---:|---:|
| Consentimento, Clube e captação | 15 | 15 |
| Carreira artística e relatórios de tráfego | 14 | 14 |
| CRM e integrações publicitárias | 8 | 8 |
| Finanças, BP e fecho restantes | 37 | 37 |
| Portal, eventos e conteúdo público | 17 | 17 |
| Exceções de aplicação em schemas geridos | 8 | 8 |
| Papéis e privilégios globais | 4 | 4 |
| Estrutura e isolamento restantes | 28 | 28 |

As causas e categorias por família estão em [familias.json](familias.json). Nenhuma diferença de definição de função ou vista ficou neste snapshot; as três funções extra continuam como presença só no replay.

Objectos com mais diferenças na família Estrutura (até 10, só nomes):

- `public.camarim_sessions.spent_total`
- `public.email_send_log.company_id`
- `public.event_cache_configs.adjusted_amount`
- `public.event_cache_configs.finalized_at`
- `public.event_cache_configs.finalized_by`
- `public.event_cache_configs.is_finalized`
- `public.event_cache_configs.minimum_guaranteed`
- `public.event_cache_configs.real_amount`
- `public.event_ticket_lots.combo_benefits`
- `public.event_ticket_lots.combo_description`

## Iterações desta etapa

O primeiro run aplicou todo o histórico e parou com 42501 na coluna de Storage; corrigiu-se o executor local para o papel administrativo já existente, mantendo o DDL. O segundo parou com 42883 no trigger de Storage. Duas dependências de função, ausentes no histórico e no replay, foram confirmadas por catálogo/pg_depend e reconstruídas por R1, com os corpos intactos e proprietário exacto. O terceiro run passou. A nova 0281 foi incorporada antes desse terceiro run; não houve migração de Live omitida do plano.

## Evidência e continuidade

[Evidência detalhada no privado](https://github.com/pedrompropicio/mundopropicio-replay/tree/1a05e68d7a925d70959fa4456dcc331e74b82e2b/evidence/20261027-review-6442428904) (catálogo comprimido, normalizações, fingerprints, ledgers e scripts; manifesto com hashes). O G2 permanece vermelho. Nenhum objecto só no replay foi apagado. QUADRO e estado ficam com Claude Code; a reserva não foi libertada.
