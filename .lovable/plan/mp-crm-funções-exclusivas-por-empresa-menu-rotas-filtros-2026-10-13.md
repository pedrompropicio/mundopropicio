# MP CRM — funções exclusivas por empresa (menu, rotas, filtros)

## 1. Levantamento (confirmado no código e na base)

Menu do MP CRM (`CrmSidebar`) — hoje só filtra por permissão, nunca por empresa.

```text
Item                 Rota                    Classe
Dashboard            /crm                    genérico
Eventos              /crm/eventos            genérico
Contactos            /crm/contactos          genérico
Contactos & tráfego  /crm/leads              genérico
Clube Newgang        /crm/clube-newgang      exclusivo (MP)
Site Newgang         /crm/sites/newgang      exclusivo (MP)
Audiências           /crm/audiences          genérico
Blog                 /crm/blog               genérico
Páginas / Vídeos / Imprensa / Config. portal genérico (portal da empresa)
Meta CAPI / Meta Audiences / Google Ads       genérico
```

Outros módulos: o ERP (`AppSidebar`) já usa `company_features` para Sync Coala, Sync Fever e Sync Health (só Cloudscape/Coala os tem ativos). Não há itens do portal Coala no MP CRM. A primeira tarefa do passo 2 é confirmar os restantes menus (MP Audience, Carreira) com uma busca por nomes de marca; os casos encontrados entram na mesma tabela.

## 2. Proposta — mesmo mecanismo `company_features`

- Novas chaves em `src/lib/features.ts` (+ etiquetas para o painel `CompanyFeaturesPanel`): `crm-clube-newgang`, `crm-site-newgang`.
- `CrmSidebar`: cada item ganha `feature?` opcional; esconde se `useHasFeature` for falso.
- Novo `RequireFeature` (componente) a envolver as rotas `/crm/clube-newgang/*` e `/crm/sites/newgang/*` (e, por coerência, as páginas Sync Coala/Fever/Health que hoje só escondem o menu). Sem a chave: ecrã "Não disponível nesta empresa" com botão para voltar ao Dashboard do CRM. Enquanto carrega: spinner (sem flash).
- Sementeira (DML, só com o teu OK): as 2 chaves ativas apenas na Mundo Propício. Nenhum nome de empresa no código.

## 3. Filtro "Todas as listas" nos Contactos

- Hoje as "listas" vêm da RPC `crm_audience_lists`: são as Audiências da empresa ativa (+ último snapshot). A MP tem 2; a Coala tem 0 — por isso o filtro aparece vazio. Já existe um segundo filtro por origem (`crm_contact_sources`) que separa por `source`, mas está escondido noutro seletor.
- Proposta (sem código Coala): o seletor "Listas" passa a ter dois grupos — "Audiências" (como hoje) e "Por origem" (cada `source` da empresa com contagem: fever_coala_2026, coala_hero_email, coala_early_bird…). Escolher uma origem aplica o filtro `source` já existente. O seletor de origem separado sai (evita dois sítios para a mesma coisa). Nomes amigáveis opcionais numa fase seguinte.
- Alternativa (não recomendada agora): gerar Audiências automáticas por origem — cria DML e snapshots a manter.

## 4. Isolamento de dados

Confirmado: `club_members`, `club_levels`, `club_point_rules`, `club_rewards`, `portal_sites` têm política RESTRICTIVE `row_belongs_to_current_company(company_id)` além do SELECT `true`. O único `portal_sites` é da Mundo Propício. Na Coala os ecrãs abrem vazios — é só UI, sem fuga. Vou ainda confirmar com uma leitura autenticada como utilizador Coala (0 linhas) antes de fechar.

## 5. Testes e docs

- vitest: menu esconde/mostra por chave; `RequireFeature` bloqueia rota sem chave e deixa passar com chave; seletor de listas mostra grupo "Por origem" quando não há audiências.
- Docs: D-ERP268 em DECISIONS.md, `estado-crm-portal-e-leads.md`, memória (multi-tenant / features por empresa), regra no AGENTS.md ("funções exclusivas de uma marca são gated por company_features, nunca por nome").

## Fora de âmbito
Sem DDL. DML só a sementeira das 2 chaves, após OK. Sem Publish. Conteúdo do Clube/Site fica no chat newgang-portal.
