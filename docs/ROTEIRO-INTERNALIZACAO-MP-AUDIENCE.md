# Roteiro de Internalização — MP Audience

> Objetivo: tudo o que hoje exige operação manual (queries diretas, disparo de edge functions à mão, decisões fora da plataforma) deve passar a ter botão, ecrã ou automatismo DENTRO do MP Audience. Meta: 100% das rotinas de configuração e análise a acontecer por dentro da plataforma, sem depender de operação externa.
> Última atualização: 25/06/2026

## Princípio orientador
Cada capacidade abaixo foi exercida manualmente (fora da plataforma) durante a preparação da campanha Ivete Clareou. O objetivo é internalizar cada uma. Prioridade: P1 (desbloqueia valor imediato / risco operacional), P2 (eficiência), P3 (robustez/escala).

---

## BLOCO A — Audiências
**A1. Sincronizar audiências do Meta → base** [P1]
- Hoje: edge `crm-meta-list-audiences` disparada manualmente.
- Falta: botão "Sincronizar audiências" no MP Audience + indicador de última sincronização.

**A2. Criar lookalike a partir de audiência** [P1]
- Hoje: edge `crm-meta-create-lookalike` disparada manualmente.
- Falta: botão "Criar semelhante (lookalike)" no seletor de audiências, com escolha de origem/país/ratio.

**A3. Inventário de audiências** [P2]
- Hoje: seletor existe no Estúdio (SearchableAudienceDialog). Sync e criação é que faltam ligar à UI.

## BLOCO B — Duelo Gemini vs GPT (motor generativo)
**B1. Ecrã de decisão do duelo** [P1]
- Hoje: duelo corre via edge `crm-audience-duel`; resultados lidos por query.
- Falta: ecrã que mostra proposta Gemini | proposta GPT lado a lado + painel central de evidência histórica determinística (ROAS por arquétipo) como árbitro factual. Botões: adotar Gemini / adotar GPT / híbrido → liga as audiências escolhidas aos adsets do Estúdio. Juiz é sempre o humano (P0: LLM nunca decide ação).

**B2. Disparar duelo pela UI** [P2]
- Hoje: invocação manual da edge (async/background, run gravado em crm.audience_duel_runs).
- Falta: botão "Pedir 2ª opinião" que dispara o duelo e faz polling do estado (running→done).

## BLOCO C — Criativos
**C1. Extração automática de dimensões de vídeo** [P1]
- Hoje: edge `crm-extract-video-dimensions` (parser MP4 moov/tkhd) disparada manualmente.
- Falta: extrair width/height/duração AUTOMATICAMENTE no momento do upload de cada vídeo (trigger/hook no fluxo de upload). Sem dimensões, o vídeo falha no upload para o Meta.

**C2. Deteção/limpeza de criativos duplicados** [P2]
- Hoje: manual (comparação de nomes/hashes).
- Falta: aviso de possíveis duplicados no Estúdio + ação de remover.

**C3. Auto-popular `meta_video_id` no sync/upload de criativos de vídeo** [P1]
- Hoje: criativos de vídeo importados/sincronizados ficam com `meta_creative_id` mas sem `meta_video_id` em `crm.meta_creatives`. Sem `meta_video_id`, o `crm-meta-publish-execute` cai no fallback "reutiliza criativo inteiro" e o copy/link novo NÃO é aplicado ao ad de vídeo. Resolvido manualmente via backfill (edge `crm-meta-peek-video-ids` lê `object_story_spec.video_data.video_id` e grava).
- Falta: no fluxo de upload e/ou no sync de criativos, ler o `video_id` do Graph e gravar `meta_video_id` automaticamente, para que o ramo `video_data` do execute seja sempre tomado e o copy/link aplicado.



## BLOCO D — Publicação e configuração de campanha vencedora
**D1. Painel de revisão pré-publicação** [P1]
- Hoje: parâmetros de "campanha vencedora" vivem no código de crm-meta-publish-execute (objetivo OUTCOME_SALES, attribution_spec 7d/1d, exclusões hierárquicas, promoted_object PURCHASE) sem controlo na UI.
- Falta: painel que mostra e deixa ajustar antes de publicar: objetivo, janela, orçamento total, atribuição, e um resumo das exclusões calculadas por adset. Inclui validação "objetivo=OUTCOME_SALES" e "pixel presente".

**D2. Verificação de pixel a disparar Purchase** [P2]
- Hoje: verificação manual no Meta Events Manager (fora da plataforma).
- Falta: indicador na plataforma do estado do pixel do evento (recebe eventos Purchase? quantos nos últimos N dias?).

**D3. Gestão de campanhas órfãs** [P3]
- Hoje: apagar campanhas PAUSED manualmente.
- Falta: listar campanhas Meta do sistema e permitir arquivar/apagar as órfãs.

## BLOCO E — Motor de leads → audiência Meta (CAPI)
**E1. Motor contínuo** [CONCLUÍDO 25/06/2026]
- RPC process_leads_capi_batch + edge process-leads-capi + crons adaptativos (leads-capi-5min só com campanha ativa, leads-capi-daily 06:00 sempre). Evento ViewContent, hashing SHA-256, regra 7 dias, marcação 2 fases anti-duplicados, throttle 80ms.

**E2. Dashboard de monitorização CAPI** [P2]
- Hoje: função crm_meta_capi_dashboard existe; estado dos leads (sent/retry/skipped/error) lido por query.
- Falta: ecrã que mostra taxa de envio, pendentes, erros, por evento.

**E3. Robustez do motor** [P3]
- Falta: (i) sweeper que reverte leads presos em status 'processing' >1h para 'retry'; (ii) cap de tentativas (capi_attempts) para evitar retry infinito em erro persistente.

## BLOCO F — Diagnóstico e aprendizagem
**F1. Posturas de decisão na UI** [P2]
- Hoje: edge functions de escalar/cirúrgica/novo-desenho deployadas; botões desativados na UI.
- Falta: ligar as 3 posturas restantes na CampaignView.

**F2. Unificar redesign no diagnóstico 360** [P2]
- Falta: crm-meta-campaign-redesign consumir só campaign_diagnosis_360 (gate 422 e prompt ainda lêem tabela antiga).

---

## Ordem sugerida de execução
1. **P1 primeiro** (desbloqueiam a operação da Ivete e das próximas campanhas sem depender de operação externa): A1, A2, B1, C1, D1.
2. **P2** (eficiência): B2, A3, C2, D2, E2, F1, F2.
3. **P3** (robustez/escala): D3, E3.

## Nota de método
Cada item internalizado deve: (a) reusar as edge functions/RPCs já construídas (não reescrever), (b) respeitar o P0 (LLM só escreve linguagem, decisões de número/ação são determinísticas ou humanas), (c) ser documentado em .lovable/memory/features/ ao ser concluído.
