# #352 — G2 normalizado após parecer 6423818497

Data da entrega: 26/10/2026. Executor: Codex. Revisor: Claude. G1 verde; G2 com diferenças residuais para parecer. Nenhuma escrita em Live.

## Evidência e continuidade

A entrega documental original foi retomada e publicada no commit público `338dc6bde35e25541b82c6f88c73cd0021568eaa`, em [g2-20261026](../g2-20261026/g2-catalogo-20261026.md). Esse relatório conserva a comparação anterior às normalizações.

Reutilizaram-se as 23 categorias de catálogo de Live. A verificação dos seus fingerprints confirmou igualdade com a recolha original. Apenas N1/N2 exigiram um suplemento SELECT de catálogo: vínculo dos triggers internos às constraints (3.290 registos) e TOAST às relações-pai (474 registos). Os fingerprints dos suplementos foram conferidos. Não se recolheram dados de tabelas, crons, buckets ou segredos.

O replay suplementar do mesmo plano confirmou continuidade estrutural fora das identidades geradas. O catálogo final comparado vem do [run 40384581355](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40384581355), commit privado `b5af5dd15f616e1fb28581f5fc3e243a2467010e`. Plano SHA-256: `536b8270c0c2f38d602142d71e6ffe96de9ba68719641f09d7ba50a17c501519`.

## Normalizações: contagens antes das reconstruções

Uma diferença significa um par objeto/propriedade, ou presença de um objeto; não equivale a uma tabela nem a uma correção.

| Passo | Antes | Depois | Redução |
|---|---:|---:|---:|
| N1 — triggers internos por constraint | 9.276 | 2.914 | 6.362 |
| N2 — TOAST por relação-pai | 2.914 | 2.078 | 836 |
| N3 — schemas de sessão | 2.078 | 1.862 | 216 |
| N4 — baseline de plataforma | 1.862 | 1.187 | 675 |
| N5 — pgmq/drizzle mantidos | 1.187 | 1.187 | 0 |
| N6 — restore_shadow separado | 1.187 | 1.185 | 2 |

Os anexos `steps-before.json` e `steps-after.json` incluem as contagens de cada passo antes e depois das reconstruções. N3 retira 264 registos de catálogo de sessão do replay e 480 de Live; não são 744 schemas distintos.

N4 usa exclusivamente a lista fechada do parecer. Uma referência qualificada ao objeto ou à sua relação-pai em ledger/Drizzle/manual conserva-o como exceção de aplicação, com ficheiro, linha e hash na evidência privada. Este critério conservador pode manter objetos filhos do fornecedor; não os exclui silenciosamente. `pgmq` e `drizzle` ficam na aplicação. `_realtime` e `supabase_functions` não foram acrescentados à lista fechada: as suas diferenças ficam no grupo (c) para parecer.

As **675 diferenças de plataforma** são baseline separado, não bloqueante. As **2 de restore_shadow** ficam como questão aberta para Pedro/frente 2: presença e ACL de `restore_shadow.take_snapshot(text,uuid)`. O schema existe dos dois lados; não foi reconstruído nem ignorado.

## Casos (a) abrangidos pelas regras aprovadas

Entraram no plano 12 objetos com definição, ACL, origem ausente e janela provadas: a tabela `crm.google_user_list_job` e 11 funções: `slugify(text)`, `unique_event_slug(text,uuid)`, `publish_event_to_portal(uuid)`, `unpublish_event_from_portal(uuid)`, as duas assinaturas de `copy_event_tour_content`, `set_company_id_on_insert_soft()`, `enforce_event_reopen_permission()`, `set_partner_portal_user(uuid,uuid)`, `partner_portal_links()` e `unset_partner_portal_user(uuid)`.

Definições e provas ficam no privado em `reconstructed/g2/`. Não se editaram corpos históricos. O suporte à definição SQL exata foi testado nativamente: caso válido passa; dependência ausente pára; nenhuma função foi invocada pelo teste.

O primeiro ensaio com 13 objetos passou estruturalmente, mas `coala_unsub_token` foi retirado ao identificar um limite anterior já aprovado mais próximo por OID. Não havia intervalo estrito de um segundo; não se deslocou outro objeto para criar espaço. O run final com 12 objetos é o resultado válido.

**G1 final: 1.486/1.486 entradas; 12/12 verificações dos novos objetos; checkpoints 114/114 e 47/47; compensação de ACL 2/2.** Artefacto `12679744798`, SHA-256 `0aa9cd15fa9b77431b24fb4514c4084660dbb83f661a31391c09fd1619fa85c1`.

## Diferenças residuais para parecer por grupo

As reconstruções eliminaram 59 diferenças: **1.185 → 1.126**, sem diferenças novas. Zero diferenças sem grupo. Não se corrigiram os grupos (b)/(c).

| Grupo | Diferenças | Encaminhamento |
|---|---:|---|
| (a) Só em Live, sem origem encontrada no repo | 339 | Rever por família; restantes casos sem janela/dependência demonstrada ou fora da autorização de sanitização |
| (b) Propriedade / origem conhecida a reconciliar | 618 | Parecer por objeto/propriedade; nenhuma correção aplicada |
| (c) Só no replay | 169 | Parecer por objeto; nenhuma remoção aplicada |

O grupo (b) contém 289 diferenças de propriedade, 327 presenças em Live com origem candidata no repositório e 2 posições físicas de colunas removidas. As 327 não são classificadas falsamente como “sem origem”: são lacunas de execução/proveniência a rever, com a propriedade `$presence`. Uma correspondência por nome continua candidata até confirmar assinatura e efeito; os anexos assinalam essa limitação.

`groups.json` apresenta contagens por categoria. Os ficheiros `residual-a-*`, `residual-b-*` e `residual-c-*` identificam objeto, propriedade, hashes e evidência de origem, sem SQL integral ou valores do catálogo.

Entre as 10 tabelas inicialmente só de Live, sete têm origem no repo: quatro nos manuais #335 e três nas Drizzle recentes (`consent_text_versions`, `club_email_events`, `club_retention_log`). Esses scripts não foram executados por iniciativa própria. A pesquisa incluiu SQL atual até `cd0e6cbda6326b1f7d55fa69b895981797d6369c`; os três commits seguintes até `1d063f4cf0b17672dd04edcd5f10695dbf0b8bd3` não mudaram SQL. O checkout do replay mantém o SHA fixado original.

Restam duas tabelas sem origem: `crm.meta_strategy_creatives` e `crm.meta_campaign_strategy_deployments`. Na primeira, a janela proposta antecede a criação do alvo FK `crm.meta_creatives`. Na segunda, falta uma janela demonstrada que respeite os vizinhos inferiores ainda não resolvidos; as suas próprias FKs apontam para `ad_platform_connections`/`meta_campaign_strategies`, não para `meta_creatives`. Esta descrição por objeto corrige a formulação conjunta imprecisa do inventário inicial; nenhuma das duas foi executada.

Funções pendentes com acesso ao vault, literal de aspeto sensível ou intervalo OID incompatível permanecem para parecer. Nenhum literal bloqueado foi publicado. Os outros deltas não receberam uma janela por conveniência. A questão `restore_shadow` e os schemas fora da lista fechada também seguem explicitamente para decisão.

## Entrega e reprodução

Evidência privada: ramo `docs/352-g2-normalized-20261026`, diretório `evidence/g2-normalized-20261026/`, com catálogo original reutilizado, suplemento, catálogo final, normalizações, disposições, verificações e índice de hashes. Os scripts de comparação preservados referenciam o checkout e corpus identificados; não são um pacote autónomo sem esses inputs. O artefacto nativo e o plano fixam o resultado executado.

Relatório público limitado a contagens, nomes, caminhos e hashes. `check-pii` aplicado aos ficheiros desta entrega antes do push. QUADRO e estado ficam para Claude Code; a libertação/atualização é solicitada ao 0 na #352. A issue permanece aberta, com G2 pendente dos pareceres por grupo. Sem seeds novos, escrita em Live, infraestrutura, deploy ou Publish.

Nos anexos públicos, o separador técnico das chaves de triggers internos é apresentado como `[trigger_table]`, com hash da chave original. Evita falsos positivos de email no scanner; a chave canónica privada e a comparação não mudam.
