## Portal do Parceiro — Visão de Evento Autorizado

### 1. Base de Dados
- Adicionar valor `'partner'` ao enum `app_role`
- Criar tabela `partner_event_access`:
  - `user_id` (parceiro), `event_id` (evento autorizado), `is_active` (permite bloquear acesso)
  - Para eventos multi-cidade: pode-se autorizar o evento-pai (acesso a tudo) ou apenas sub-eventos específicos
- RLS: parceiro só lê dados de eventos onde tem `partner_event_access` ativo

### 2. Gestão de Acessos (Admin)
- Na página de **Gestão de Utilizadores** ou no **Detalhe do Evento (aba Sócios)**, o admin pode:
  - Convidar parceiro (cria conta com role `partner`)
  - Vincular/desvincular eventos e sub-eventos
  - Ativar/desativar acesso (toggle `is_active`)

### 3. Layout Dedicado do Parceiro
- Quando o user logado tem role `partner`, renderiza um layout simplificado:
  - **Sem sidebar completa** — apenas lista de eventos autorizados
  - Header com logo + botão sair
  - Página inicial: lista dos eventos autorizados (cards)
  - Ao clicar num evento: visualização read-only com 3 abas:
    - **Bilhetes** (zonas, lotes, vendas)
    - **Business Plan** (receitas e despesas previstas)
    - **Transações** (movimentos financeiros do evento)
  - Para eventos multi-cidade: seletor de cidades/sub-eventos conforme autorização

### 4. Permissões e Segurança
- Role `partner` não tem nenhuma das permissões existentes (`manage_*`, `view_*`)
- Acesso controlado exclusivamente via `partner_event_access`
- Dados são **somente leitura** — nenhum botão de criar/editar/eliminar
- Possibilidade de bloquear acesso a qualquer momento (toggle `is_active`)

### Fases de implementação:
1. Migração DB (enum + tabela + RLS)
2. Interface de gestão de acessos do parceiro
3. Layout dedicado do parceiro + páginas read-only
4. Fluxo de convite do parceiro
