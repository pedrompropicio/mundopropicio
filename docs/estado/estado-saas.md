# Estado — saas

> Chat `saas` (projeto/assessoria, pesado, só R0). Aberto a 04/11/2026 por decisão do Pedro. Prompt: `docs/prompts/saas.md`.
>
> **O repo é público.** Este ficheiro tem só o estado do projeto e ponteiros. Preços, margens, custos, estratégia comercial, potenciais clientes e análise de concorrência vivem no Projeto do Claude (`claude/saas-*`), no Drive com partilha restrita ou num Claude Doc.

## Objetivo

Transformar o MP Gestão Eventos (ERP, Audience, CRM, Produção) num produto SaaS vendável a terceiros em Portugal e no Brasil, cobrindo a parte técnica, funcional, comercial, marketing, jurídica e operacional.

## Organização: 5 pilares (decisão do Pedro, 04/11/2026)

| Pilar | Dono | Estado |
|---|---|---|
| 1 · Produto (módulos, pacotes, o que fica de fora) | `saas` | Inventário de módulos feito (só leitura, `main` 7c87ea23) |
| 2 · Técnico: 2a isolamento · 2b segurança e residência · 2c planos e assinatura · 2d PT e BR | frente 2 (executa); `saas` (requisitos) | 2a em curso (#591, #584); 2b em curso (#202, plano de independência); 2c requisitos entregues na #629; 2d na #457/#498 |
| 3 · Comercial, marketing e financeiro | `saas` | Pesquisa de mercado e concorrência PT/ES/BR feita (fora do repo) |
| 4 · Suporte e pessoas | `saas` (desenho) | Por iniciar |
| 5 · Jurídico | `juridico` (decide) | Pedido de parecer sobre a entidade vendedora no QUADRO |

## Decisões do Pedro (04/11/2026)

- O produto nasce pronto para Portugal e Brasil ao mesmo tempo, numa só codebase.
- Marca de venda: MP Labs. Direção: MP Labs como sociedade própria, separada da produtora. Uma ou duas sociedades (PT e BR) fica para decidir com parecer jurídico e tributário.
- Primeiro cliente terceiro pagante: 1.º trimestre de 2027, depois de o backend estar na UE, com piloto gratuito antes.
- O segmento de partida em cada mercado decide-se depois da pesquisa (feita; análise a seguir).
- Ordem de trabalho: pilares 1 e 3 em paralelo com o 2a.

## A seguir

1. Modelo de negócio (pilar 3): primeira versão feita (página privada, fora do repo), com as premissas como hipóteses. Custos por empresa a medir com o piloto BR — plano de medição na #629 (comentário 6622192118); faltam as faturas da plataforma, a entregar pelo Pedro. Data da leitura de 30 dias a combinar.
2. Frente 2: dividir a #629 em filhas com classe e executor.
3. Parecer do `juridico` sobre a entidade vendedora.
4. Desenho do suporte e da implementação (pilar 4), medindo a entrada das três empresas brasileiras do grupo.

## Documentos confidenciais (ponteiros, Projeto do Claude)

- `claude/saas-mercado-concorrencia-pt-br-2026-11-04.md`
- `claude/saas-inventario-modulos-2026-11-04.md`
- `claude/saas-pauta-juridica-tributaria-entidade-2026-11-04.md`
- Claude Doc "SaaS MP — Mapa dos 5 pilares"
