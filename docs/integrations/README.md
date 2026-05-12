# docs/integrations/

Documentação detalhada de integrações específicas do MP Gestão Eventos / MP Audience.

## Quando uma integração vive aqui vs no `INTEGRATIONS.md` da raiz

O ficheiro `INTEGRATIONS.md` na raiz do repo é o **catálogo curto** de todas as integrações ativas: o que faz, qual a edge function correspondente, qual o estado (ativa/sandbox/pendente). É o sítio onde se procura rapidamente "que integrações existem?".

Esta pasta `docs/integrations/` é onde uma integração ganha uma **página própria** quando passa de qualquer um destes limiares:

- Tem fluxo OAuth ou ciclo de tokens (refresh, expiração).
- Tem mais do que uma edge function envolvida.
- Tem decisões fechadas / racional histórico que não cabe num catálogo.
- Tem troubleshooting recorrente que vale formalizar.
- Tem pendentes próprios suficientes para não caber numa linha.

Resumo: o `INTEGRATIONS.md` da raiz responde "**que** integração existe"; esta pasta responde "**como** funciona, porque foi feita assim, e o que ainda falta".

## Índice de páginas

| Página | Integração | Estado |
|---|---|---|
| [`lovable-mcp.md`](./lovable-mcp.md) | Lovable MCP (acesso programático Claude.ai/Claude Code → Lovable Cloud) | ✅ Operacional |
| [`meta-ads.md`](./meta-ads.md) | Meta Ads (OAuth, Custom Audiences, Conversions API para MP Audience) | ⏳ Em construção |

## Páginas a criar conforme necessário

As seguintes integrações vivem hoje no `INTEGRATIONS.md` da raiz e podem ganhar página própria se a complexidade crescer:

- **Twilio** (WhatsApp + SMS) — quando passar de sandbox para produção e ganhar fluxos de opt-in/opt-out.
- **Lovable Email** (transacionais com React Email) — se ganhar suppression lists, templates por idioma, retry policies complexas.
- **Web Push (VAPID)** — se ganhar segmentação por tópico ou agendamento.
- **Frankfurter / exchangerate.host** (FX) — provavelmente fica sempre no catálogo, é simples.
- **Lovable AI Gateway (Gemini)** — se ganhar mais use cases além de OCR camarim e classificação de categorias.
- **Parsers de bilheteira** (Ticketline, Fever, Coala) — cada parser tem comportamentos próprios e pode merecer página individual se forem adicionados novos.
- **TikTok Ads, Google Ads** — quando entrarem no MP Audience.
- **IGAC, Moloni, SAF-T** — só se vierem a ser implementados (não estão no roadmap atual, dependem de bilheteira própria que não está prevista).

## Convenções de página

Cada página em `docs/integrations/` deve ter, no mínimo:

1. **Status** (operacional, sandbox, em construção, descontinuado) com data de última verificação.
2. **O que é** em 2-3 linhas.
3. **Componentes envolvidos** (edge functions, tabelas, secrets, dependências externas).
4. **Como verificar o estado / health check.**
5. **Como re-autenticar ou recuperar de falhas comuns.**
6. **Casos de uso típicos.**
7. **Limitações conhecidas.**
8. **Pendentes / próximos passos.**
9. **Histórico** das alterações relevantes (data + linha curta).

Manter cada página focada na **integração**, não em arquitetura geral do produto — isso vive no `CLAUDE.md`, `DOCUMENTATION.md`, `DATABASE.md` da raiz.
