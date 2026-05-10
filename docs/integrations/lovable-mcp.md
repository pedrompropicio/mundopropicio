# Integração Lovable MCP

**Status:** ✅ Operacional em ambas as superfícies (claude.ai + Claude Code)
**Conta Lovable:** `pedroneto@mundopropicio.com` · Workspace: `Pedro's Lovable` · Plano: Pro/Max
**Última verificação:** 2026-05-10

---

## O que é

A Lovable expõe um servidor MCP em `https://mcp.lovable.dev` que dá acesso programático aos projetos da workspace: ler ficheiros, correr SQL na DB (Lovable Cloud), inspecionar histórico de edits, deploy, gestão de connectors. **34 ferramentas no total.**

A integração vive em **duas superfícies independentes**, ambas autorizadas via OAuth na mesma conta Lovable:

| Superfície | Onde se gere | Para quê |
|---|---|---|
| **claude.ai (app web/desktop)** | Settings → Conectores → Lovable | Conversas estratégicas, análise, planeamento (esta conversa aqui) |
| **Claude Code (terminal)** | `/mcp` dentro do CC (abre o mesmo Diretório) | Execução: editar ficheiros, correr SQL, fazer commits, debug |

Ambas têm acesso aos mesmos workspaces e projetos. Não há conflito — funcionam em paralelo.

---

## Verificar estado (sem armadilhas)

❌ **Não confiar em** `claude mcp list` no terminal — pode mostrar "Needs authentication" mesmo quando OAuth está válido. Reporta estado de config, não do backend.

✅ **Fonte de verdade:** UI do Diretório → Conectores → card **Lovable**:

- Botão visível **"Desvincular"** → está autenticado ✅
- Botão **"Conectar"** → precisa de re-autenticação ⚠️
- Lista de "Ferramentas (34)" visível → backend operacional

Acesso rápido:
- Da app Claude: barra superior → Conectores → pesquisar "lovable"
- Do Claude Code: escrever `/mcp` no prompt (abre o mesmo Diretório)

---

## Re-autenticar se partir

1. Abrir Diretório → Conectores → Lovable
2. Clicar **Desvincular** (se aparecer)
3. Clicar **Conectar** → autorizar no browser com `pedroneto@mundopropicio.com`
4. Confirmar 34 ferramentas listadas

Não é preciso correr `claude mcp add` nem mexer em `.mcp.json` — esta UI gere tudo.

---

## Casos de uso típicos

```text
# Inspeção
"Via Lovable MCP, lista as tabelas do schema crm"
"Via Lovable MCP, lê o ficheiro supabase/migrations/20250510_crm_init.sql"
"Via Lovable MCP, mostra os últimos 5 edits do projeto MP Gestão Eventos"

# Debug
"Via Lovable MCP, consulta crm.ad_platform_connections e mostra registos com state=pending"

# Não usar para
- create_project / send_message → consomem créditos Lovable (preferir UI do Lovable directa)
- deploy_project → fazer pelo Lovable manualmente, é raro precisar via MCP
```

---

## Limitações conhecidas

- **Research preview** — tools podem mudar nomes/parâmetros sem aviso (Lovable docs)
- **Scope = workspace inteira** — a autorização dá acesso a TODOS os projetos da workspace `Pedro's Lovable`, não apenas MP Gestão Eventos
- **Créditos** — `send_message` e `create_project` consomem créditos da workspace; restantes 32 tools são gratuitas
- **Não substitui acesso Supabase direto** — DDL, RLS avançado, edge functions secrets, dashboard de monitoring continuam só acessíveis dentro do Lovable. Ver pendente: transferência de ownership Supabase

---

## Pendentes relacionados

- [ ] Decidir transferência ownership Supabase (sessão dedicada, manhã com calma)
- [ ] Configurar secrets META_APP_ID, META_APP_SECRET, ENCRYPTION_MASTER_KEY
- [ ] Implementar Edge Function `crm-meta-oauth-callback`
- [ ] Implementar Edge Function `crm-refresh-ad-tokens`
- [ ] Integração OAuth Meta end-to-end

---

## Histórico

- **2026-05-10** — Configuração inicial confirmada. Connector já estava autenticado em ambas as superfícies; a confusão inicial veio de `claude mcp list` reportar "Needs authentication" desatualizado. Documentado para evitar re-trabalho.
