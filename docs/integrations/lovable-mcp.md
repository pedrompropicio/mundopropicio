# Lovable MCP — integração

> Acesso programático aos projetos Lovable da workspace do owner, a partir de Claude.ai (chat) e Claude Code (terminal local).

| | |
|---|---|
| **Status** | ✅ Operacional em ambas as superfícies |
| **URL do servidor** | `https://mcp.lovable.dev` |
| **Conta autorizada** | `pedroneto@mundopropicio.com` |
| **Workspace** | `Pedro's Lovable` |
| **Plano Lovable** | Business |
| **Tools disponíveis** | 34 |
| **Última verificação** | 2026-05-10 |

---

## 1. O que é

A Lovable expõe um servidor MCP (Model Context Protocol) em `https://mcp.lovable.dev` que permite a clientes externos — Claude.ai, Claude Code, Cursor, etc. — inspecionar e atuar sobre os projetos da workspace **sem precisar de credenciais Supabase próprias**.

É a **única via** prática para o Claude Code inspecionar a DB e o repo na cloud do Lovable, dado que:

- O projeto Supabase do MP Gestão Eventos vive na organização da Lovable (decisão fechada, ver §6).
- Não há `supabase` CLI direto acessível.
- A dashboard Supabase não é exposta.

Sem o Lovable MCP, o Claude Code ficava cego à DB e ao estado real do projeto na cloud do Lovable, e o workflow ficava muito mais lento (copy/paste constante entre superfícies).

---

## 2. Duas superfícies, uma autorização

A integração vive em **duas superfícies independentes**, ambas autorizadas via OAuth na mesma conta Lovable:

| Superfície | Onde se gere | Para quê |
|---|---|---|
| **Claude.ai** (web/desktop/iOS) | Settings → Connectors → Lovable | Conversas estratégicas, análise, planeamento — pensar |
| **Claude Code** (terminal Mac) | `/mcp` dentro do CC (abre o mesmo Diretório) | Execução: editar ficheiros, correr SQL, fazer commits — fazer |

Ambas têm acesso aos **mesmos** workspaces e projetos. Não há conflito — funcionam em paralelo, partilham a mesma autorização OAuth backend.

---

## 3. Tools disponíveis (34)

> Todas as tools vêm com o prefixo `Lovable:` quando chamadas.

### Leitura (read-only, sem custo)
- `get_me` — perfil autenticado e workspaces.
- `list_workspaces`, `get_workspace` — workspaces e detalhes (plano, créditos, membros).
- `list_projects`, `get_project` — projetos da workspace.
- `list_files`, `read_file` — inspecionar o repo na cloud do Lovable.
- `list_edits`, `get_message`, `get_diff` — histórico de edits e diffs de commit/mensagem.
- `get_project_knowledge`, `get_workspace_knowledge` — ler Project Knowledge.
- `query_database` — **SQL `SELECT` direto à DB Postgres do projeto.** Não fazer DML/DDL aqui — usar migration.
- `get_database_status` — saber se a DB Cloud (Supabase) está provisionada.
- `get_project_analytics`, `get_project_analytics_trend` — visitantes, pageviews, bounce, real-time (só projetos publicados).
- `list_library_projects`, `list_template_projects` — biblioteca e templates.
- `list_connections`, `list_connectors`, `list_available_connectors`, `list_custom_connectors` — connectors configurados.
- `get_file_upload_url` — presigned URL para upload.

### Escrita (consomem créditos Lovable)
- `send_message` — pedir ao agente Lovable que faça algo (gera código, aplica edits). **Preferir UI directa do Lovable** para tarefas grandes; via MCP é útil para tarefas pequenas e atómicas vindas de Claude Code.
- `create_project` — criar projeto novo. **Raramente usado a partir do MCP.**
- `remix_project` — fork de projeto existente.

### Escrita (sem custo de créditos)
- `set_project_knowledge`, `set_workspace_knowledge` — atualizar knowledge.
- `set_project_visibility`, `set_folder_visibility` — visibilidade.
- `add_connector`, `remove_connector` — gerir connectors.
- `enable_database` — provisionar Cloud DB num projeto novo.
- `deploy_project` — publicar para produção (`*.lovable.app`).

### Padrão de uso
- Read-only no Claude Code: aprovar com **"Yes, always allow"** na primeira chamada.
- Escrita: aprovar **"Allow once"** caso a caso, sobretudo `send_message` e `deploy_project`.

---

## 4. Como verificar o estado (sem armadilhas)

❌ **NÃO confiar em** `claude mcp list` no terminal. Pode mostrar `Needs authentication` mesmo quando o OAuth está válido — reporta estado de configuração local, não do backend OAuth.

✅ **Fonte de verdade:** UI do Diretório de Conectores → card **Lovable**:

- Botão visível **"Desvincular"** → está autenticado ✅
- Botão **"Conectar"** → precisa de re-autenticação ⚠️
- Lista de "Ferramentas (34)" visível → backend operacional

Como abrir o Diretório:
- **Claude.ai:** barra superior → Connectors → pesquisar "lovable".
- **Claude Code:** escrever `/mcp` no prompt (abre o mesmo Diretório).

### Smoke test mínimo
No Claude Code, depois de abrir uma sessão no repo:

```text
Via Lovable MCP, lista os meus workspaces e projetos disponíveis e identifica o MP Gestão Eventos.
```

Resposta esperada: workspace `Pedro's Lovable` listada, projetos lá dentro, MP Gestão Eventos identificado pelo ID `ab7cf7e3-a5fc-4737-9cc1-2ba7cf43887f` (este UUID é estável).

---

## 5. Re-autenticar se partir

1. Abrir Diretório de Conectores (claude.ai → Connectors, ou `/mcp` no Claude Code).
2. Clicar no card **Lovable**.
3. Clicar **Desvincular** (se aparecer).
4. Clicar **Conectar** → autorizar no browser com `pedroneto@mundopropicio.com`.
5. Confirmar que aparecem as 34 ferramentas listadas.

**Não é preciso** correr `claude mcp add` nem mexer em `.mcp.json` — esta UI gere tudo. Setup duplicado (com entry custom em `.mcp.json` E connector na UI) cria conflito; manter apenas o connector da UI.

### iOS
No iPhone, gerir connectors pelo Safari em `claude.ai` (Settings → Connectors). Depois de conectado, fica disponível no app iOS automaticamente.

---

## 6. Casos de uso típicos

### Inspeção
```text
Via Lovable MCP, lista as tabelas do schema public que começam por crm_
Via Lovable MCP, lê o ficheiro supabase/migrations/20260510_crm_init.sql
Via Lovable MCP, mostra os últimos 5 edits do projeto MP Gestão Eventos
Via Lovable MCP, lê o Project Knowledge atual
```

### Debug em runtime (única via para a DB)
```text
Via Lovable MCP, consulta crm_ad_platform_connections e mostra registos com state='pending'
Via Lovable MCP, conta quantas policies RLS existem na tabela transactions
Via Lovable MCP, mostra as últimas 10 entradas de audit_log para a empresa X
```

### Verificar estado pós-push
Depois do Claude Code fazer push de uma migration ou edge function:
```text
Via Lovable MCP, lista os ficheiros em supabase/migrations e confirma que o último commit aparece
Via Lovable MCP, lê o último ficheiro de migration e confirma o conteúdo
```

Isto é fundamental — **não confiar em screenshots como prova de estado**. A fonte de verdade é o `list_files` / `read_file` via MCP.

### Quando NÃO usar
- `send_message` para tarefas grandes — preferir UI directa do Lovable.
- `create_project`, `deploy_project` — preferir UI directa do Lovable.
- DML/DDL via `query_database` — usar migration, não SQL ad-hoc.

---

## 7. Limitações conhecidas

- **Research preview.** Tools podem mudar nomes/parâmetros sem aviso. Sempre que algo falhar, verificar se o nome da tool ainda existe via `tool_search` (no Claude.ai/Claude Code) antes de assumir bug.
- **Scope = workspace inteira.** A autorização OAuth dá acesso a **todos** os projetos da workspace `Pedro's Lovable`, não apenas MP Gestão Eventos. Manter cuidado se a workspace ganhar projetos sensíveis no futuro.
- **Créditos.** `send_message`, `create_project` e `remix_project` consomem créditos da workspace. As restantes 30+ tools são gratuitas.
- **Permissões herdadas.** O MCP herda exatamente as permissões da conta autenticada — não cria superpoderes.
- **Não substitui acesso Supabase direto.** O que continua fora do alcance:
  - `supabase` CLI local (`db push`, `db diff`, `db reset`).
  - Dashboard Supabase com logs detalhados, monitoring, billing.
  - Configurar secrets de Edge Functions (continua via UI do Lovable Cloud).
  - Replication, point-in-time recovery, configurações avançadas.
  - Service role key, JWT secrets diretos.

---

## 8. Decisões fechadas

### Lovable Cloud como infraestrutura permanente
**Decidido em maio de 2026.** A organização do projeto Supabase fica na Lovable. Não há transferência de ownership planeada. O custo de migração (semanas, recriar 90+ tabelas e dados de produção) não compensa o ganho. Racional completo no `CLAUDE.md` §5.1 e no Project Knowledge do Lovable.

Implicações para esta integração:
- **Lovable MCP é a única via realista** para acesso programático à DB em runtime.
- Re-avaliação só se o produto atingir **500+ promotores pagantes** ou **>$5M ARR** (~3+ anos).
- Workflow híbrido Claude Code (autor) + Lovable (executor) é o destino permanente, não etapa.

### Não usar API key estática
O setup inicial considerou usar uma API key Lovable (`lov_...`) configurada manualmente em `.mcp.json`. **Descartado** em favor de OAuth via UI de Connectors:

- Mais simples (nenhum ficheiro local com chave).
- Refresh automático de tokens.
- Mesmo backend OAuth partilhado entre Claude.ai e Claude Code.
- Permite revogar facilmente em caso de comprometimento.

---

## 9. Pendentes relacionados

> Lista curta. Itens fechados saem desta secção.

- ⏳ Configurar secrets no Lovable Cloud (não diretamente relacionados ao MCP, mas dependentes do mesmo Lovable Cloud): `META_APP_ID`, `META_APP_SECRET`, `ENCRYPTION_MASTER_KEY`. Ver [`meta-ads.md`](./meta-ads.md).

---

## 10. Troubleshooting

| Sintoma | Provável causa | Resolução |
|---|---|---|
| `claude mcp list` mostra "Needs authentication" mas tools funcionam | CLI desatualizada vs estado real do OAuth backend | Ignorar a CLI; verificar pela UI de Connectors. |
| Tool MCP devolve `401 Unauthorized` ou `403 Forbidden` | Token OAuth expirou | Re-autenticar via §5. |
| Tool não aparece no `tool_search` | Tools podem ter mudado em research preview | Verificar [docs Lovable](https://docs.lovable.dev/integrations/mcp); a Lovable evolui o catálogo sem aviso. |
| `query_database` falha com "permission denied" | Tentativa de DML/DDL | Usar migration; `query_database` é só `SELECT`. |
| Setup duplicado (entry `lovable` em `.mcp.json` + connector `claude.ai Lovable` na UI) | Configuração mista | Remover entry de `.mcp.json` com `claude mcp remove lovable`; manter só o connector da UI. |
| iOS não mostra opção "Add custom connector" | App iOS gere connectors via web | Configurar pelo Safari em `claude.ai` → Settings → Connectors. |

---

## 11. Histórico

- **2026-05-10** — Setup inicial confirmado em ambas as superfícies (Claude.ai e Claude Code). Decisão Lovable Cloud permanente registada também no Project Knowledge. Commit `f408b498` em `origin/main`.
- **2026-05-11** — Adicionada secção de troubleshooting com casos reais já observados.

---

## 12. Referências

- `CLAUDE.md` (raiz) §4 — workflow Claude Code + Lovable.
- `CLAUDE.md` (raiz) §5.1 — decisão Lovable Cloud permanente.
- [Documentação oficial Lovable MCP](https://docs.lovable.dev/integrations/mcp) — pode mudar sem aviso.
- Project Knowledge do Lovable — resumo permanente sincronizado.
