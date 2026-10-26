# #352 — par coerente e G2 N1–N7

Parecer: [6425793808](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6425793808). Origem/data: catálogo Live por SELECT; GitHub Actions; 26/10/2026, UTC.

**G1 verde: 1.520 entradas executadas desde vazio.** Checkpoints 47/47 e 114/114; compensação de ACL 2/2. **G2 vermelho: 807 diferenças de aplicação, em 12 famílias**, todas classificadas. Os residuais seguem a parecer; não autorizam criação da homologação.

[Run final](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40400888107) · [Evidência privada](https://github.com/pedrompropicio/mundopropicio-replay/tree/485e58990714fc72200735b882a41a8cba7bcb32/evidence/g2-consistent-20261026) · [Resumo/hash/contagens](resumo.json) · [Normalizações](normalizacoes.json) · [Famílias](familias.json)

## Par consistente

- Public main fixado em `d7c08b3292cf5f8cd9ffccf297e02bae4e4eda35`; replay `eff824d2fae96f6ae23412c4ba88390414946088`. #329 confirmada antes de cada push.
- Cobertura Live: 711 versões Supabase + 268 Drizzle, 979/979; zero entradas ausentes. A #314 acrescentou duas Drizzle durante o trabalho e o par foi actualizado.
- Fingerprints das 25 categorias iguais entre 2026-10-26T20:30:00.200Z e 2026-10-26T21:15:17.990Z; ledgers também estáveis. Conteúdo anterior reutilizado apenas após igualdade de fingerprint; funções/ACL alteradas pela #314 actualizadas por chave e revalidadas integralmente.
- O avanço f78cd614 → d7c08b32 alterou documentação, teste e edge-function; nenhum SQL de migração/manual. O SHA fixado foi actualizado antes do run final.

## Regras aplicadas

- N7 remove slots `attisdropped` e compara a sequência lógica. Permutações reais continuam como diferença.
- N4 inclui `_realtime` e `supabase_functions`; objetos/pais referidos por ledger, Drizzle ou manual continuam aplicação. N5 mantém pgmq/Drizzle.
- `restore_shadow.take_snapshot` e ACL no grupo (b), com origem no ledger.
- Reconstruídas `email_queue_dispatch()` e `email_queue_wake()`: nomes de segredo apenas; nenhum valor do vault consultado. Mantida a substituição de host previamente aprovada, igual nos dois lados do G2.
- `crm.meta_campaign_strategy_deployments` entrou pela janela provada e passou a verificação nativa. As duas FKs existem nesse ponto. `meta_strategy_creatives` continua pendente porque a FK para `meta_creatives` ainda não existe na janela autorizada.

## DDL manual

Cinco scripts #335 admitidos, só o CREATE OR REPLACE FUNCTION: `offset_approval`, `status`, `cash_position`, `cash_position_invariant` e `restore`. Todas as definições DDL desses scripts coincidem com pg_get_functiondef de Live após normalização de tokens/defaults equivalentes, preservando literais. Hashes, linhas, exclusões de DML e prova por objeto estão no manifesto privado. G1 foi repetido desde vazio.

Ficam para parecer:

- `cash_watch` e `offset_balance`: definições divergentes; scripts não admitidos.
- `offset_group_storage`, `offset_core`, `offset_invariants`, `trigger_watch` e `control_status`: validação integral pendente. O teste nativo do lote terminou em SQLSTATE `42703` e fez rollback. `offset_core` L87–90 exige `financial_accounts.mirror_partner_aporte`, ausente no replay. O artefacto conserva SQLSTATE/hash da mensagem, não o texto integral; essa ligação de dependência vem da leitura do SQL e do catálogo.
- Três scripts operacionais de emergência/desactivação/reactivação excluídos; nenhum DML/seed deles executado.

O run 40398692772 teve G1 e captura G2 verdes, mas o teste separado de manuais falhou. Esse teste não foi repetido no workflow final: os candidatos pendentes continuam fora do plano; apenas as cinco definições integralmente provadas foram admitidas.

## Normalizações — antes/depois

| Regra | Antes | Depois |
|---|---:|---:|
| N1 | 9052 | 2658 |
| N2 | 2658 | 1814 |
| N3 | 1814 | 1598 |
| N4 | 1598 | 810 |
| N5 | 810 | 810 |
| N6 | 810 | 810 |
| N7 | 810 | 807 |

Linha-base de plataforma: 788 diferenças, registadas em separado. Exceções N4 continuam nos residuais abaixo.

## Residuais por família

Grupos: (a) 219 só Live sem definição encontrada no repo; (b) 532 propriedades/presenças com origem candidata; (c) 56 só replay. Origem candidata não equivale a prova de aplicação. Zero diferenças sem classe.

| Família | Diferenças | Causa / bloqueio |
|---|---:|---|
| Encontro de contas e guardas financeiras (#335) | 270 | DDL da #335 ainda fora do plano: duas definições divergem; o lote nativo falhou com 42703 e fez rollback. Faltam tabelas, deltas, políticas e privilégios associados. Cinco definições iguais já foram admitidas. |
| Consentimento, Clube e captação | 1 | A constraint consent_text_versions_channel_check continua com definição distinta, apesar de todas as 268 Drizzle estarem representadas. |
| Carreira artística e relatórios de tráfego | 53 | ACL, colunas em falta/ordem lógica e propriedades de índices/funções de carreira e tráfego ainda divergem. |
| CRM e integrações publicitárias | 109 | A tabela meta_strategy_creatives continua sem janela executável por FK; persistem colunas/rotinas sem origem demonstrada e propriedades diferentes. meta_campaign_strategy_deployments já entrou e passou. |
| Finanças, BP e fecho restantes | 67 | Deltas financeiros e ACL continuam distintos; inclui mirror_partner_aporte em financial_accounts, dependência do núcleo #335. Ordens restantes são lógicas, depois de N7. |
| Portal, eventos e conteúdo público | 22 | Ordem lógica das colunas de eventos/fornecedores e ACL ainda diferem; N7 não elimina permutações reais. |
| pgmq e filas de email | 26 | pgmq mantém-se aplicação por N5: objetos/registos de extensão só no replay e duas presenças só em Live; não foram excluídos como plataforma. |
| Exceções de aplicação em schemas geridos | 46 | Dependências de aplicação em schemas geridos mantidas pela exceção N4, incluindo propriedades/presenças em storage; não há exclusão adicional. |
| Papéis e privilégios globais | 59 | ACL de funções/relações, papéis e configurações de papéis continuam diferentes após excluir só os dois papéis de plataforma aprovados. |
| Outras funções e vistas | 31 | Definições/configurações de funções/vistas e presenças sem prova histórica suficiente; os casos não admitidos permanecem para parecer. |
| Estrutura e isolamento restantes | 121 | Constraints, defaults, enums, tipos e ordem lógica de colunas ainda distintos; nenhuma alteração de tipo/remoção foi aplicada para os fazer coincidir. |
| restore_shadow — origem no ledger | 2 | take_snapshot e a sua ACL faltam no replay; origem no ledger reconhecida. Ambos no grupo (b), sem questão aberta separada. |

## Limites e coordenação

Os casos sem janela/dependências provadas não foram reconstruídos por suposição. Não foram corrigidas propriedades divergentes, nem alargadas as exclusões. A diferença de catálogo permanece bloqueio para parecer por família.

Live: só SELECT de catálogo e dos ledgers autorizados. Sem dados novos, seeds novos, valores de segredos, infra, deploy ou Publish. Os seeds e checkpoints anteriormente autorizados foram mantidos. Relatório público só com nomes, contagens e hashes.

Reserva #352 mantida durante o trabalho; QUADRO/estado não escritos pelo Codex. No comentário de fecho pede-se ao 0/Claude Code actualizar estado e libertar a reserva. #352 permanece aberta.

Correcção de execução: no run 40397505166, a consulta de confirmação das duas funções novas usava o OID de Live na base local. Foi substituída por schema/nome/assinatura, sem alterar o DDL, e os runs seguintes passaram essa verificação.
