# Auditoria Técnica — Funil Meta Pixel na plataforma Ticketline

**Data:** 14/05/2026
**Audiência:** Equipa técnica e comercial Ticketline
**Origem:** Mundo Propício, Lda. — Sistema de Gestão de Eventos
**Versão:** 1.0

---

## 1. Contexto e Metodologia

Como parte do nosso esforço contínuo de monitorização da qualidade de tracking dos eventos que comercializamos via Ticketline, desenvolvemos internamente uma ferramenta de auditoria automatizada do funil Meta Pixel (designação interna: Funnel Test 360).

A ferramenta executa navegação real headless através de Browserless + Puppeteer, percorrendo os 6 passos do funil de compra de bilhetes (navegar para a sessão → selecção de zona → selecção de quantidade → adicionar ao carrinho → validar carrinho → iniciar checkout), sem realizar qualquer transacção. Durante a navegação são capturados:

- Pixel events disparados (Meta Pixel `facebook.com/tr/` calls)
- Console errors do browser
- Network requests bloqueados ou redireccionados
- Screenshots por step
- DOM snapshots em caso de falha
- Métricas Lighthouse (LCP, TBT, TTI, CLS, performance score)

Em **14/05/2026** corremos a ferramenta sobre 4 eventos da plataforma:

| Evento | Venue | Duração da auditoria |
|---|---|---|
| Ivete Clareou 2026 | Cascais | 67 s |
| Simone Mendes Tour Portugal — Porto | Super Bock Arena, Porto | 42 s |
| Simone Mendes Tour Portugal — Lisboa | MEO Arena, Lisboa | 42 s |
| Ensaios da Anitta — Lisboa | Passeio Marítimo de Algés, Lisboa | 43 s |

**Todos os 4 eventos completaram o funil com sucesso (6/6 steps PASSED).** O fluxo de compra funciona em produção sem regressões. Os achados abaixo referem-se exclusivamente à instrumentação Meta Pixel/CAPI observada durante esses fluxos.

Os achados técnicos foram detectados em **todos os 4 eventos auditados**, cobrindo 3 produtores diferentes e 4 venues diferentes. Os sintomas observados são **byte-a-byte idênticos** entre as 4 runs (mensagens de erro literalmente iguais, listas de domínios CSP literalmente iguais, mesmas frequências de invocação). Esta identidade dos sintomas — não o número de runs em si — é o que sustenta a hipótese de que os achados têm origem em **configuração partilhada do servidor**, não em circunstância específica de cada página de evento.

---

## 2. Achados Técnicos

Listados por prioridade técnica decrescente.

### 2.1 [ALTA PRIORIDADE] Endpoint CAPI Gateway com prefix `demo-1` em produção

**Detecção:** **12 invocações** por sessão ao endpoint `https://demo-1.conversionsapigateway.com/events?cee=no`, em **4/4 runs**. URL idêntico em todas as auditorias.

**Erro associado no console (4/4 runs, byte-a-byte idêntico):**

> *"Connecting to `'https://demo-1.conversionsapigateway.com/events?cee=no'` violates the following Content Security Policy directive: `default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: api.ticketline.pt analytics.tiktok.com ...`"*

**Interpretação:** O subdomínio `demo-1.*` em `conversionsapigateway.com` é tipicamente um environment de staging/teste do CAPI Gateway. A invocação a este endpoint em ambiente de produção (`www.ticketline.pt`) sugere que a configuração do client CAPI ficou apontada para um environment de demo, possivelmente desde a fase de implementação inicial.

**Impacto:** Os eventos de conversão **não estão a chegar ao Meta CAPI de produção** via este Gateway. Mesmo que o Pixel client-side dispare correctamente no browser (e dispara — confirmamos PageView/AddToCart/InitiateCheckout em 4/4 runs), o relay server-side via CAPI está inactivo em produção. Combinado com o problema 2.3 abaixo (CSP a bloquear a conexão), o sinal de conversão fica com duas camadas de redundância simultaneamente inactivas.

**Recomendação:** Confirmar com a equipa que implementou o CAPI Gateway qual é o environment configurado actualmente em produção, e migrar para o endpoint de produção. Tipicamente a mudança envolve apenas uma variável de configuração no servidor que injecta o snippet CAPI.

---

### 2.2 [ALTA PRIORIDADE] Header HTTP `Content-Security-Policy` malformado

**Detecção:** Entre **220 e 395 console errors por sessão**, em 4/4 runs. Mensagem de erro idêntica.

**Erro literal observado (4/4 runs):**

> *"The Content-Security-Policy directive name `':'` contains one or more invalid characters. Only ASCII alphanumeric characters or dashes `'-'` are allowed in directive names."*

**Interpretação:** A primeira directive do header HTTP `Content-Security-Policy` emitido pelo servidor `www.ticketline.pt` tem como nome o caractere literal `:` em vez de um nome válido (`default-src`, `script-src`, `connect-src`, etc.). Browsers modernos rejeitam essa directive. Dependendo da tolerância do browser, pode também afectar o parsing das directives seguintes na mesma policy.

**Hipótese de causa:** Bug no middleware/proxy que constrói o header. Por exemplo:

```
# Output incorreto observado:
Content-Security-Policy: : default-src 'self'; script-src ...

# Output esperado:
Content-Security-Policy: default-src 'self'; script-src ...
```

(Espaço/dois-pontos a mais antes da primeira directive.)

**Impacto:** Volume elevado de erros no console (220–395 por sessão) que dificulta debugging e análise de performance. Possível invalidação de políticas adjacentes em browsers que façam parsing estrito.

**Recomendação:** Auditar o middleware/web server que injecta o header CSP e corrigir o nome da primeira directive. Validar em browser DevTools que o header HTTP de resposta começa directamente com `Content-Security-Policy: default-src ...`.

---

### 2.3 [ALTA PRIORIDADE] CSP `default-src` exclui domínios Meta/Facebook

**Detecção:** Allow-list CSP `default-src` idêntica byte-a-byte em 4/4 runs.

**Domínios actualmente permitidos no `default-src`** (extracto observado):

```
'self' 'unsafe-inline' 'unsafe-eval' data: blob:
api.ticketline.pt
analytics.tiktok.com
*.usercentrics.eu
*.ticketline.sapo.pt
google.com *.google.com *.google.pt
googleads.g.doubleclick.net
*.openstreetmap.org
fonts.gstatic.com
services.ticketline.pt
*.sapo.io *.sapo.pt
wa.sl.pt
*.youtube.com
*.vimeo.com
*.google-analytics.com
*.googleapis.com
stats.g.dou… (truncado)
```

**Domínios em falta para integração Meta completa:**

- `*.facebook.com` (Pixel direct + Custom Audience match)
- `*.facebook.net` (Pixel JavaScript SDK)
- `*.conversionsapigateway.com` (CAPI Gateway de produção)

**Impacto observado:** A comunicação com Meta fica limitada ao Pixel direct (`facebook.com/tr/`), que continua a chegar via outros mecanismos do browser. Mas os mecanismos enhanced ficam restringidos:

- Conversions API server-side via Gateway
- Custom Audience match via iframe (já bloqueado pelo `frame-src` — ver mais abaixo)
- Signal collection avançada
- Browser-side relay fallback

Adicionalmente observamos que o `frame-src` (separado do `default-src`) bloqueia explicitamente iframes para `facebook.com`:

> *"Framing `'https://www.facebook.com/'` violates the following Content Security Policy directive: `frame-src 'self' *.googletagmanager.com *.checkout.com js.klarna.com osm.klarnaservices.com *.youtube.com ...`"*

**Recomendação:**

1. Adicionar ao `default-src` (ou ao `connect-src` se estiver separado):
   - `*.facebook.com`
   - `*.facebook.net`
   - `*.conversionsapigateway.com`
2. Adicionar ao `frame-src`:
   - `*.facebook.com`

Estas alterações alinham a allow-list com a implementação Meta padrão e desbloqueiam os mecanismos de redundância de tracking.

---

### 2.4 [ALTA PRIORIDADE] Evento `ViewContent` ausente nas páginas de evento

**Detecção:** Em **4/4 eventos auditados**, nenhum dos pixels detectados dispara o evento `ViewContent` na página individual do evento.

**Eventos detectados durante a navegação:**

| Evento Pixel | Detectado? | Step onde dispara |
|---|---|---|
| `PageView` | ✓ (sempre) | navigate_home, add_to_cart, initiate_checkout |
| **`ViewContent`** | **✗ ausente em 4/4** | — |
| `AddToCart` | ✓ | select_quantity (na selecção de quantidade) |
| `InitiateCheckout` | ✓ | initiate_checkout (no botão "Finalizar compra") |
| `SubscribedButtonClick` | ✓ | Auto-detected pelo Meta para botões trackeados |

**Impacto:**

- **Custom Audiences** baseadas em "visitantes que viram um evento específico mas não compraram" ficam impossíveis de construir directamente sobre dados Ticketline. Os clientes têm de recorrer a workarounds (proxy via URL pattern em PageView), que são menos precisos.
- **Lookalike Audiences** baseadas em intenção (não apenas conversão) perdem o seed natural do `ViewContent`.
- **Signal de optimização** para algoritmos Meta (CBO / value-based bidding) fica empobrecido — `ViewContent` é tipicamente o primeiro sinal forte de intenção do funil, posicionado entre `PageView` (passivo) e `AddToCart` (acção).

**Recomendação:** Acrescentar `ViewContent` no template da página individual de cada evento (a página onde `AddToCart` já dispara — `select_quantity` em termos da nossa nomenclatura interna). Parâmetros sugeridos:

```javascript
fbq('track', 'ViewContent', {
  value: <preço do bilhete mais barato disponível>,
  currency: 'EUR',
  content_ids: ['<ID do evento Ticketline>'],
  content_type: 'product',
  content_name: '<nome do evento>',
  content_category: '<categoria — música, teatro, desporto, etc.>'
});
```

Idealmente o `value` é o preço da zona mais barata disponível no momento (ou o preço médio), e os `content_ids` mapeiam para os mesmos IDs usados nos eventos `AddToCart` / `InitiateCheckout` (consistência cross-event é importante para o algoritmo Meta).

---

### 2.5 [PRIORIDADE MÉDIA] Pixel `262551145900645` regista apenas `PageView`

**Detecção:** Em 4/4 runs, o Pixel ID `262551145900645` dispara `PageView` mas nunca dispara eventos de conversão (`AddToCart`, `InitiateCheckout`), em contraste com os outros pixels da Ticketline (`1278718090963655`, `370581274727932`) que disparam todos os eventos do funil.

**Hipóteses (em aberto, a confirmar internamente):**

- Pixel configurado para tracking de tráfego agregado sem regras de Custom Events associadas (caso intencional, está conforme)
- Pixel legado no template, possivelmente sem owner activo na Meta Business Manager actual
- Pixel em fase de migração ou substituição

**Impacto:** Em si não é crítico — o pixel a contar tráfego sem contar conversões coexiste com outros pixels que estão a fazer o tracking de conversão. Trazemo-lo à atenção apenas porque a sua presença em 4/4 eventos com comportamento idêntico sugere que está no template comum, e quem analise dados desta property pode estranhar relatórios apenas com `PageView`.

**Recomendação:** Validar internamente se a limitação a `PageView` é intencional. Se for intencional, ignorar este ponto. Se for legado/órfão, considerar limpeza para simplificar a atribuição.

---

## 3. Resumo Quantitativo

| Achado | Eventos afectados (de 4) | Pixels afectados | Prioridade |
|---|---|---|---|
| 2.1 CAPI Gateway em endpoint `demo-1` em produção | **4/4** (12× por run) | Todos os pixels que tentem CAPI relay | Alta |
| 2.2 Header CSP malformado (directive `':'`) | **4/4** (220–395 errors/run) | Todos | Alta |
| 2.3 CSP `default-src` + `frame-src` excluem Meta | **4/4** (allow-list byte-a-byte idêntica) | Todos | Alta |
| 2.4 `ViewContent` ausente | **4/4** | Todos os 8 pixels detectados | Alta |
| 2.5 Pixel `262551145900645` órfão (só PV) | **4/4** | 1 pixel específico | Média |

**Pixels distintos detectados durante as 4 auditorias:** 8 no total, dos quais 3 aparecem consistentemente em todos os eventos (presumimos serem pixels operacionais da plataforma) e 5 aparecem apenas em subconjuntos dos eventos (presumimos serem dos produtores/agências individuais).

---

## 4. Próximos Passos Sugeridos

Estamos disponíveis para uma reunião técnica conjunta para:

1. **Apresentar os findings em maior detalhe** — logs raw, screenshots por step, network captures, e DOM snapshots estão disponíveis sob pedido. Podemos partilhar os JSONs completos das 4 runs auditadas.

2. **Discutir prioridades e timelines** de correção. Reconhecemos que os 4 achados de prioridade alta envolvem equipas técnicas diferentes (DevOps para o header CSP; equipa CAPI para o endpoint; equipa frontend para o ViewContent).

3. **Coordenar re-auditoria após implementação** para validar fixes. A nossa ferramenta corre em ~50 segundos por evento, e podemos re-correr sobre qualquer subset de eventos da plataforma para confirmar que os fixes funcionaram em produção real.

4. **Partilhar abordagem comparativa.** Estamos a estender a auditoria a outras bilheteiras parceiras nos próximos meses (Blueticket, BOL, See Tickets, FNAC Tickets, Eventbrite). Gostaríamos de partilhar convosco findings comparativos quando disponíveis — pode ser útil contexto de mercado.

5. **Eventualmente, partilha de aprendizagem com a indústria.** Se houver interesse mútuo, poderemos no futuro avaliar a partilha conjunta de um case study técnico de implementação Meta Pixel/CAPI bem feita em bilheteira online — material que pode posicionar ambas as marcas como referências técnicas no sector. Esta é apenas uma possibilidade futura, não prioridade desta auditoria.

---

## 5. Sobre esta Auditoria

Esta auditoria foi realizada pela equipa técnica da **Mundo Propício, Lda.** utilizando o Sistema de Gestão de Eventos da plataforma. Para coordenação de reunião conjunta ou pedido de dados raw adicionais, contactar a equipa Mundo Propício através dos canais habituais.

---

## Anexo — Notas sobre a Metodologia

A ferramenta Funnel Test 360 é uma implementação interna da Mundo Propício para auditoria automatizada do funil Meta Pixel via browser headless real (não simulado). Cada auditoria:

- Carrega a URL alvo num browser real automatizado
- Aceita os cookies necessários e dispensa modals/popups que apareçam durante a navegação
- Percorre passo-a-passo o funil de compra padrão até ao último passo pré-pagamento
- Em cada step captura: pixel events disparados (intercept de network), console messages, screenshot, snapshot do DOM, e métricas de performance (LCP, TBT, TTI, CLS)
- Termina antes do passo de pagamento real — **não realiza qualquer transacção**

Os dados raw das 4 auditorias estão preservados na nossa base de dados, com timestamps, run IDs únicos, e screenshots numerados por step. Disponíveis a pedido, em formato que se adeque à investigação técnica conjunta.
