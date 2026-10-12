# Issue #311 — Inventário papel → permissão por empresa (só leitura)

Tarefa só de leitura: sem alterações a código, base, migrações ou docs. O relatório é entregue no chat, num bloco que se pode copiar. Não são criados ficheiros.

## Leituras prévias
- docs/INDEX.md, docs/estado/estado-plataforma-e-infra.md
- .lovable/memory/features/* e .lovable/memory/security/*: tudo sobre permissões, papéis, has_permission, role_permissions
- Issue #311 (edge function github-issues, action get, number 311)

## 1. Guardas no frontend
- Procurar em src/: `role ===`, `isAdmin`, `isManager`, `isPartner`, `isAccountant`, `isPlatformAdmin`, `has_role`, `ROLE_`, `hasFullAccessRole`.
- Para cada ocorrência: ficheiro:linha, o que protege (rota, menu, botão ou secção) e a permissão proposta (chave já existente em ALL_PERMISSIONS ou chave nova `module.*`).

## 2. Configurações
- Percorrer as rotas em src/App.tsx e AdminPanel, mais os ecrãs de empresa, utilizadores e permissões, integrações (Meta, Google, TikTok, Resend), contas, plano de contas, bilheteiras, features e marca/portal.
- Para cada uma: rota, ficheiro, guarda actual e chave `settings.*` proposta.

## 3. Servidor
- Consultas a pg_policies (expressões com has_role ou user_roles), a pg_proc (SECURITY DEFINER que chamam has_role) e rg nas supabase/functions (has_role, user_roles, verificações de role).
- Destaque para o schema crm.* e para lead_capture, contacts, leads, promotores e as tabelas do portal.
- Indicar o que teria de mudar para um manager com module.crm/module.audience conseguir ler e escrever os dados da sua empresa.

## 4. Resolução por empresa
- Ler AuthContext, permissions.ts, has_permission_in, has_role e current_company_id.
- Indicar onde o papel é global (platform_admin com company_id NULL, `role` único no AuthContext) e propor como resolver pela empresa activa sem quebrar platform_admin.

## Fecho
- Matriz papel → conjunto por omissão (role_permissions) que mantém exactamente o acesso actual de cada utilizador.
- Query só de leitura a auth.users + user_roles + user_permissions: lista dos utilizadores cujo acesso efectivo mudaria se não se semeasse nada.
- Questões em aberto apenas no relatório final.
