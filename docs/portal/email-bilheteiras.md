# Email para Bilheteiras — Levantamento de Capacidades Técnicas

**Contexto:** Levantamento para perceber, bilheteira a bilheteira, o que é possível em termos de tracking, webhook de venda e reconciliação. Não bloqueia o roadmap; informa Fase 4+ (reconciliação purchase via CAPI).

**Tom:** Profissional, neutro, sem revelar a estratégia de portal próprio nem o receio de boicote. Apresentar como "melhoria de tracking de campanhas". Cada bilheteira recebe versão ligeiramente adaptada se necessário.

---

## Versão padrão (assunto + corpo)

**Assunto:** Mundo Propício · Pedido técnico — tracking de campanhas Meta

**Corpo:**

Caro/a [Nome do contacto técnico],

A Mundo Propício está a reforçar a infraestrutura de tracking das campanhas de tráfego pago Meta Ads que corre para os eventos que vendemos em conjunto. Para conseguirmos atribuição mais precisa e reduzir perda de sinal em iOS 14+ e ad blockers, gostaríamos de perceber as capacidades técnicas da vossa plataforma de bilhética em três pontos concretos.

Agradecíamos resposta breve a:

**1. Parâmetros de URL no checkout**
A URL que partilhamos para checkout (`https://[vossa-bilheteira]/...?evento=xpto`) aceita parâmetros adicionais arbitrários (do tipo `&mp_click_id=abc123` ou `&utm_source=...`) que sobrevivam até à página de confirmação de compra? Esses parâmetros ficam acessíveis no registo da venda?

**2. Webhook de venda / API de relatório**
Existe webhook que dispara quando ocorre uma venda (preferencialmente em tempo real)? Caso não, existe API REST onde possamos puxar relatório de vendas do dia anterior? Em qualquer dos casos, o payload/relatório inclui os parâmetros mencionados no ponto 1 (para reconciliarmos campanha → venda)?

**3. Pixel Meta e Conversions API**
A vossa plataforma permite-nos configurar o **nosso próprio pixel Meta** (Mundo Propício) na página de checkout/confirmação, além do vosso? Suportam envio dual via Conversions API (CAPI) server-side com o nosso `event_id` para dedup?

Esta informação ajuda-nos a planear melhor as próximas campanhas em conjunto. Caso prefiram, podemos agendar uma call de 20 minutos com a vossa equipa técnica.

Obrigado pela atenção,

Pedro Neto
Founder & CEO
Mundo Propício Entretenimento
+351 [telefone]
pedro@mundopropicio.com

---

## Notas operacionais para Pedro

### Quando enviar
A qualquer momento — não bloqueia o roadmap. Sugestão: enviar quando começar a Fase 2 da migração, para as respostas estarem prontas quando chegar à reconciliação CAPI (pós-MVP).

### A quem enviar
Para cada bilheteira que a MP usa hoje. Identificar contacto técnico, não comercial — o comercial vai redireccionar e perder uma semana. Se não houver contacto técnico conhecido, pedir ao comercial habitual para indicar.

### Como interpretar respostas

| Resposta | Interpretação | Acção MP |
|---|---|---|
| Sim aos 3 pontos | Bilheteira "premium". CAPI dual e webhook em tempo real possíveis. | Prioritária para campanhas de alto investimento. |
| Sim a 1+2, não a 3 | Reconciliação batch funciona, pixel próprio só client-side. | OK; CAPI feito por MP via webhook. |
| Sim só a 1 | Tracking básico funciona, mas reconciliação manual via CSV diário. | Aceitável; mais trabalho do lado MP. |
| Não a tudo | Bilheteira "fechada". Só tracking client-side de intent, purchase fica cego. | MP captura tudo até clique; reconciliação só por correspondência manual de vendas com cliques. Onde haja escolha de bilheteira, despriorizar. |
| Não respondem | Padrão. Reenviar 1× após 7 dias. Se silêncio, assumir "fechada". | — |

### Sinal vermelho a observar
Se uma bilheteira oferece o "serviço de tráfego pago paralelo" e na resposta minimiza capacidades técnicas ("o nosso pixel já faz tudo, não precisa do vosso"), é sinal de alinhamento contra a MP. Documentar internamente e considerar trocar de bilheteira quando houver alternativa.

### Confidencialidade
Nada do que vai neste email revela o portal próprio em construção, o roadmap MP CRM, nem a estratégia de independência do pixel. Apresentação é puramente técnica.
