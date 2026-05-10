# Integração Lovable MCP

**Status:** ✅ Operacional em ambas as superfícies (claude.ai + Claude Code)
**Conta Lovable:** pedroneto@mundopropicio.com · Workspace: Pedro's Lovable · Plano: Business
**Última verificação:** 2026-05-10

## O que é

A Lovable expõe um servidor MCP em `https://mcp.lovable.dev` que dá acesso programático aos projetos da workspace: ler ficheiros, correr SQL na DB (Lovable Cloud), inspecionar histórico de edits, deploy, gestão de connectors. 34 ferramentas no total.

A integração vive em duas superfícies independentes, ambas autorizadas via OAuth na mesma conta Lovable:

- **claude.ai (app web/desktop)** — gerida em Settings → Conectores → Lovable. Para conversas estratégicas, análise, planeamento.
- **Claude Code (terminal)** — gerida via `/mcp` dentro do Claude Code (abre o mesmo Diretório). Para execução: editar ficheiros, correr SQL, fazer commits, debug.

Ambas têm acesso aos mesmos workspaces e projetos. Não há conflito.

## Verificar estado (sem armadilhas)

**Não confiar em** `claude mcp list` no terminal — pode mostrar "Needs authentication" mesmo quando OAuth está válido.

**Fonte de verdade:** UI do Diretório → Conectores → card Lovable:
- Botão "Desvincular" visível → está autenticado ✅
- Botão "Conectar" → precisa de re-autenticação ⚠️
- Lista "Ferramentas (34)" visível → backend operacional

## Re-autenticar se partir

1. Abrir Diretório → Conectores → Lovable
2. Clicar Desvincular (se aparecer)
3. Clicar Conectar → autorizar no browser com pedroneto@mundopropicio.com
4. Confirmar 34 ferramentas listadas

Não é preciso correr `claude mcp add` nem mexer em `.mcp.json`.

## Casos de uso típicos

- "Via Lovable MCP, lista as tabelas do schema crm"
- "Via Lovable MCP, lê o ficheiro supabase/migrations/<nome>.sql"
- "Via Lovable MCP, mostra os últimos 5 edits do projeto"
- "Via Lovable MCP, consulta crm.ad_platform_connections e mostra registos com state=pending"

**Não usar para:** create_project e send_message consomem créditos Lovable. Preferir UI directa do Lovable para isso.

## Limitações conhecidas

- Research preview — tools podem mudar nomes/parâmetros sem aviso
- Scope é a workspace inteira — autorização dá acesso a todos os projetos de Pedro's Lovable
- Créditos — apenas send_message e create_project consomem; restantes 32 tools são gratuitas

## Decisões fechadas

- **Lovable Cloud é a infraestrutura permanente** (maio 2026). Não migrar para Supabase próprio enquanto não atingirmos 500+ promotores ou >$5M ARR. Custo de migração (semanas, recriar 90+ tabelas e dados de produção) não compensa o ganho. O fluxo híbrido **Claude Code escreve → push → Lovable aplica** é o destino, não temporário. Rationale completo no Project Knowledge do projeto Lovable.

## Pendentes relacionados

- Configurar secrets META_APP_ID, META_APP_SECRET, ENCRYPTION_MASTER_KEY no Lovable Cloud
- Implementar Edge Function crm-meta-oauth-callback
- Implementar Edge Function crm-refresh-ad-tokens
- Integração OAuth Meta end-to-end com testes

## Histórico

- **2026-05-10** — Setup inicial confirmado em ambas as superfícies (Claude.ai e Claude Code). Decisão Lovable Cloud permanente registada também no Project Knowledge.
