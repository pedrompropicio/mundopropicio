# Funnel Test 360 — Análise Ticketline para reunião interna

**Data:** 14/05/2026
**Audiência:** equipa interna Mundo Propício (analista de tráfego pago)
**Fonte de dados:** 4 auditorias automatizadas em produção (Funnel Test 360)
**Confidencialidade:** Interno MP — não partilhar

---

## Contexto

A 14/05/2026 corremos auditoria automatizada do funil Meta Pixel em **4 eventos distintos** da plataforma Ticketline (Ivete Clareou — Cascais; Simone Mendes — Porto; Simone Mendes — Lisboa; Anitta EDA — Lisboa), cobrindo **3 produtores diferentes em 4 venues diferentes**. Cada run percorreu 6 steps do funil (home → zona → quantidade → carrinho → validar → checkout) com navegação real headless. Todas as 4 runs completaram 6/6 steps. Os achados abaixo são padrões sistémicos detectados em **todos os 4 eventos**, com os erros byte-a-byte idênticos entre runs.

> **Nota sobre o significado de "4/4 byte-a-byte idêntico":** quatro eventos com produtores e venues diferentes não constitui amostra estatística representativa, mas o facto de os erros aparecerem com mensagens textuais e listas de domínios literalmente iguais entre as 4 runs é forte sinal de **configuração no servidor partilhado** (não circunstância da página específica). Se fosse problema do evento individual, esperaríamos variação. A robustez do achado vem da identidade dos sintomas, não do tamanho amostra.

---

## Evidência empírica — Problemas Ticketline confirmados em 4/4

| Problema | Confirmado em | Sob controlo de |
|---|---|---|
| ViewContent ausente em páginas de evento | 4/4 | Ticketline |
| CSP header malformado (directive name = `:`) | 4/4 (220–395 errors/run) | Ticketline |
| `demo-1.conversionsapigateway.com` invocado em produção | 4/4 (12×/run) | Ticketline |
| CSP `default-src` exclui Facebook/Meta/CAPI | 4/4 (byte-a-byte idêntico) | Ticketline |
| CSP `frame-src` bloqueia `facebook.com` | 4/4 | Ticketline |
| Pixel `262551145900645` órfão (só PageView) | 4/4 | Ticketline |

Notas operacionais:
- 8 Pixel IDs distintos detectados no total: **3 são operador Ticketline** (presentes em 4/4 eventos) e **5 são variáveis por produtor** (Ivete tem 2 próprios, Anitta tem 2 próprios, Simone tem 1 partilhado entre Porto e Lisboa)
- `SubscribedButtonClick` aparece em 4/4: é evento INTERNO Meta (auto-detection de botões trackeados), não custom dos clientes — dá-nos sinal de intenção utilizável para Custom Audiences sem precisar de evento custom da Ticketline

---

## Accountability matrix completa

| # | Problema | Sob controlo | Impacto estimado | O que MP pode fazer |
|---|---|---|---|---|
| 1 | ViewContent ausente | Ticketline | Alto — est. impacto significativo em remarketing dinâmico e signal de intenção | Reportar; aguardar fix; ou implementar via GTM do nosso lado se viável |
| 2 | CSP header malformado | Ticketline | Médio (efeito cascata sobre outras directives) | Reportar; aguardar fix |
| 3 | CAPI demo em produção | Ticketline | Alto — est. degradação significativa em atribuição iOS pós-ATT (relay server-side inactivo) | Reportar; aguardar fix |
| 4 | CSP bloqueia Meta/CAPI | Ticketline | Alto (enhanced mechanisms inviabilizados) | Reportar; aguardar fix |
| 5 | **Qual é o nosso Pixel ID nos eventos auditados?** | MP/analista | Desconhecido — *bloqueia* análise downstream | Investigar agora (ver lista abaixo) |
| 6 | O nosso Pixel dispara conversões ou só PageView? | MP/analista | Crítico se só PV (como o 262551 da Ticketline) | Verificar Meta Events Manager |
| 7 | Audiences/segmentação | MP/analista | Não auditado | Análise separada |
| 8 | Criativos/copy/landing externa | MP/analista | Não auditado | Análise separada |
| 9 | Bid strategy / CBO / budget shape | MP/analista | Não auditado | Análise separada |
| 10 | Atribuição cross-canal (post-iOS14, ATT, view-through) | MP/analista | Não auditado | Análise separada |

---

## Pontos a clarificar internamente antes da reunião

Dos 8 Pixel IDs detectados nas 4 auditorias, **3 são da Ticketline (operador)** e **5 são variáveis por produtor**. Para podermos decompor o gap de performance entre factores Ticketline (já evidenciados) e factores internos (ainda por mapear), precisamos de trazer dados para os seguintes pontos:

### 1. Identificação do Pixel MP/cliente

Dos 8 Pixel IDs abaixo, **qual é o nosso (ou de cada cliente MP)?**

| Pixel ID | Presença | Inferência atual |
|---|---|---|
| `1278718090963655` | 4/4 (todos os eventos) | Ticketline operador (fire-all) |
| `370581274727932` | 4/4 (todos os eventos) | Ticketline operador (fire-all) |
| `262551145900645` | 4/4 (mas **só PageView**) | Ticketline órfão / template-only |
| `1287478146582771` | só Ivete | Produtor Ivete (ou agência) |
| `971220245282210` | só Ivete | Produtor Ivete (2º pixel) |
| `1608617547054908` | 2/2 sub-events Simone (Porto+Lisboa) | Produtor Simone Mendes (tour-level) |
| `1820968798730182` | só Anitta | Produtor Anitta |
| `1315053343719880` | só Anitta | Produtor Anitta (2º pixel) |

### 2. Eventos disparados pelo nosso pixel

Para o(s) Pixel ID(s) identificado(s) como nosso/cliente MP:
- **Dispara todos os eventos esperados** (PageView + ViewContent + AddToCart + InitiateCheckout + Purchase)?
- Ou só alguns (como o `262551145900645` da Ticketline que só dispara PageView)?
- Confirmar via Meta Events Manager → Test Events tab + histórico real de 7 dias.

### 3. CAPI próprio vs CAPI Ticketline

- Temos CAPI server-side próprio configurado a partir do nosso backend (independente da Ticketline)?
- Ou estamos a depender exclusivamente do CAPI da Ticketline (que está partido — endpoint `demo-1` em produção)?

### 4. ROAS por plataforma

Qual é o ROAS por campanha nas últimas 4 semanas, **segmentado iOS vs Android**?
- Se gap iOS de **25–40%** vs Android → consistente com CSP a bloquear CAPI = explicado pelos problemas Ticketline detectados (item 3/4 da matrix)
- Se gap iOS menor ou similar a Android → há outras causas a investigar (ATT opt-in rate, criativos diferentes por plataforma, etc.)

### 5. Audiences e configuração

- Que audiences estamos a usar como base de targeting? Saved audiences? Lookalikes?
- Os Lookalikes têm como source "Purchasers" ou "ViewContent visitors"?
  - Se Purchasers: degradados pela sub-reportação de conversões iOS (problema Ticketline)
  - Se ViewContent: inviabilizados pela ausência total de ViewContent (problema Ticketline)
- Em qualquer caso, há decisões de configuração nossas a auditar.

### 6. ViewContent custom — possibilidade de implementar do lado MP

- A Ticketline não dispara `ViewContent` em 4/4 eventos auditados (confirmado sistémico).
- Conseguimos implementar `ViewContent` via GTM próprio que carregue na página da Ticketline? Ou estamos dependentes de mudança no template Ticketline?
- Se conseguíssemos implementar do nosso lado, mitigamos um dos 4 problemas técnicos sem precisar de cooperação Ticketline.

### 7. Teto de performance e decomposição do gap

- **Cenário hipotético**: se a Ticketline resolvesse os 4 fixes técnicos (CAPI prod + CSP fixado + ViewContent + pixel órfão limpo), qual o ROAS estimado atingível?
- Como decompor o gap actual entre **factores Ticketline confirmados** e **factores internos** (audiences, criativos, bid strategy, atribuição cross-canal)?
- Esta decomposição não tem de ser exacta — é input qualitativo para priorizar onde investir energia primeiro.

---

## O que esta auditoria NÃO responde

Para mantermos honestidade sobre o que esta análise prova e não prova:

A ferramenta auditou **apenas tracking técnico do funil de compra** numa só sessão headless por evento. Não mede:

- Qualidade de criativos / hooks / CTAs
- Targeting / audiences / Lookalike quality / saved audiences
- Bid strategy / CBO / dayparting / budget shape
- Aprendizagem do algoritmo Meta (learning phase, exit velocity)
- Atribuição cross-canal (Google Ads, TikTok, organic)
- ATT opt-in rate iOS (afeta CAPI fallback efficacy)
- LTV de comprador e value-based optimization
- Funnel de email/CRM downstream
- Estrutura de campanha (ad set / ad / placement breakdowns)

**Estes factores podem explicar performance mediana INDEPENDENTEMENTE dos problemas Ticketline detectados.** Os problemas Ticketline reduzem o teto de performance possível, mas dentro desse teto há muito que o analista controla.

---

## Conclusão para reunião interna

1. **A Ticketline tem 4-6 problemas técnicos confirmados em 4/4 eventos auditados** (CAPI demo em produção, CSP malformado, CSP exclui Meta, ViewContent ausente). Estes problemas reduzem objectivamente o teto de performance acessível via tráfego pago Meta. Vão a separado para reunião com Ticketline (ver Relatório B).

2. **Há trabalho do nosso lado que ainda não auditámos**:
   - Identificar e configurar o nosso Pixel ID
   - Investigar se podemos implementar ViewContent custom via GTM nosso
   - Auditar audiences, criativos, bid strategy, atribuição

3. **Quadro preliminar de decomposição (a refinar com dados internos):**
   - Uma fracção do gap actual é explicável pelos problemas Ticketline confirmados (sob controlo deles)
   - A fracção remanescente fica sob controlo da configuração/operação MP (audiences, criativos, bid strategy, atribuição)
   - O peso relativo entre as duas fracções é o input qualitativo a trazer da reunião — não precisa de ser número exacto, basta ordem de grandeza para priorizar acções

4. **Próximos passos:**
   - **Esta semana**: analista responde às 7 perguntas acima com dados concretos (Meta Events Manager screenshots, ROAS segmentado, Pixel ID identificação)
   - **Próximas 2 semanas**: reunião MP↔Ticketline para apresentar os 4 fixes técnicos (ver Relatório B)
   - **Próximo mês**: re-auditoria pós-fixes Ticketline (Funnel Test 360 corre em ~50s/evento) para validar
   - **Trimestre**: revisão interna de audiences, criativos, bid strategy, separadamente desta análise técnica

---

## Dados raw para apoio (caso solicitado em reunião)

- Run IDs: `f46f57e4-…` (Ivete), `ffc70bbe-…` (Simone Porto), `9cf07d03-…` (Simone Lisboa), `6092cfcd-…` (Anitta)
- Console errors raw + screenshots por step disponíveis na BD (`crm.funnel_test_runs`) e Storage (`funnel-test-screenshots` bucket)
- Network requests com `raw_url` Meta Pixel completo (incluindo content_ids, value, currency quando presentes)
- Veredicto IA gerado por run (4 disponíveis, todos convergem nos mesmos achados)

Storage tem retention agressiva (~30min a horas) — se precisares de screenshots específicos para a reunião, capturar nos próximos minutos.
