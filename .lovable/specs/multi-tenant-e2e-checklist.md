---
name: Multi-tenant E2E checklist
description: Roteiro PT-PT manual (~30min) para validar isolamento entre empresas em Test antes da Fase 7 Live
type: feature
---

# Roteiro E2E Multi-empresa — Test environment

> Tempo estimado: **30–45 minutos**.
> Pré-requisito: Demo 2 já existe em Test (`6e174fca-69b6-4173-9aca-11a0a8355840`); MP é a `975254b9-…`.
> Faz este roteiro **antes** de despoletar a Fase 7 (migração Live).

---

## 0. Pré-flight (1min)
- [ ] Confirmar que estás em **Test** (não Live).
- [ ] Confirmar que Lovable Cloud está `ACTIVE_HEALTHY` (sem migrações em curso).
- [ ] Ter à mão um **email alternativo** (não o `pedroneto@mundopropicio.com`) para criar o admin Demo 2.

## 1. Baseline Mundo Propício (3min)
- [ ] Login como `pedroneto@mundopropicio.com` (admin MP).
- [ ] Anotar contagens visíveis no dashboard:
  - Eventos: ___ (esperado: 12)
  - Transações: ___ (esperado: 139)
  - Fornecedores: ___ (esperado: 91)
  - Categorias: ___ (esperado: 146)
  - Camarim: ___ (esperado: 6 itens)
- [ ] Confirmar que o **logo** mostrado é o da Mundo Propício e o tema (azul/verde) está aplicado.
- [ ] Confirmar que aparece o card **"Empresas"** em `/admin` (porque és platform_admin).

## 2. Criar admin para Demo 2 (5min)
- [ ] Ir a `/admin/empresas`.
- [ ] Confirmar que vês as 2 empresas listadas (Mundo Propício + Demo 2).
- [ ] Clicar em **"Convidar admin"** na linha da Demo 2.
- [ ] Inserir: email alternativo, role=`admin`.
- [ ] **Copiar o link de convite** que aparece no toast/modal.
- [ ] Logout.

## 3. Aceitar convite (3min)
- [ ] Abrir o link `/accept-invitation?token=…` em **janela anónima** (para garantir sessão limpa).
- [ ] Definir nome completo + password (mínimo 8 chars).
- [ ] Submeter. Esperado: redirect para `/auth` ou direto para o dashboard.
- [ ] Login com o email alternativo + password definida.

## 4. Validação cross-tenant — sessão Demo 2 (10min)
> Este é o teste **mais crítico**. Estás logado como admin Demo 2.

- [ ] **Dashboard**:
  - [ ] Eventos: ___ (esperado: **0**)
  - [ ] Transações: ___ (esperado: **0**)
  - [ ] Fornecedores: ___ (esperado: **0**)
  - [ ] Categorias: ___ (esperado: **0**)
  - [ ] Camarim: ___ (esperado: **0**)
- [ ] **Branding**: o `--primary` deve mudar (Demo 2 tem laranja `15 85% 55%`). Mesmo sem logo carregado, a cor primária dos botões muda.
- [ ] `/admin/empresas` **não** aparece (não és platform_admin).
- [ ] Tentar abrir manualmente `/admin/empresas` na URL → deve redirecionar ou mostrar 403.
- [ ] **Profiles**: ir a `/admin/users` (gestão de utilizadores) — deves ver SÓ o teu próprio user (1), não os 6 da Mundo Propício.
- [ ] Criar 1 evento de teste (`Demo Evento 1`, qualquer cidade), 1 transação, 1 fornecedor.
- [ ] Anexar 1 ficheiro pequeno (PDF/imagem) à transação.
- [ ] **Inspecionar Storage** via DevTools Network: o `path` enviado para `transaction-documents` tem de começar por `6e174fca-…/`.

## 5. Re-validação Mundo Propício (5min)
- [ ] Logout. Login de volta como `pedroneto@mundopropicio.com`.
- [ ] Confirmar que as **contagens originais estão intactas** (12/139/91/146/6).
- [ ] Confirmar que **não vês** o evento "Demo Evento 1", o fornecedor da Demo 2, nem a transação criada na Demo 2.
- [ ] Ir a `/admin/users` — só vês os 6 utilizadores MP, **não** vês o admin Demo 2 que criaste.
- [ ] Ir a `/admin/empresas` — vês ambas as empresas (és platform_admin).

## 6. Edge functions críticas (8min)
> Verificar que functions com lógica complexa respeitam isolamento.

- [ ] **`database-backup`**: provocar 1 backup manual a partir de `/admin/backups` enquanto estás como MP. Confirmar que o ficheiro gerado contém SÓ dados MP (nome do ficheiro deve referir Mundo Propício ou estar prefixado).
- [ ] **`generate-historical-transactions`**: na Demo 2, tentar gerar histórico para um evento — deve falhar ou trabalhar isoladamente sobre dados Demo 2.
- [ ] **`audit-categories`**: na Demo 2, abrir `/admin/auditoria-contas` — deve mostrar empty state (Demo 2 não tem dados a auditar).
- [ ] **`match-categories`**: criar 1 transação na Demo 2 com descrição genérica — confirmar que o matching de categoria respeita o catálogo Demo 2 (que está vazio).
- [ ] **`approve-transaction`**: aprovar a transação criada no passo 4 — deve funcionar normalmente, registar em `transaction_audit_log` com `company_id` Demo 2.

## 7. Cleanup (opcional, 2min)
- [ ] Apagar o admin Demo 2 criado (em `/admin/empresas` ou `/admin/users` como platform_admin).
- [ ] Apagar a transação/fornecedor/evento de teste criados na Demo 2 (via lixeira).

---

## ⚠️ Critérios de bloqueio para a Fase 7

**Se algum destes falhar, NÃO avançar para Live**:
- ❌ Admin Demo 2 vê **qualquer** dado da Mundo Propício (mesmo 1 row).
- ❌ Admin MP vê **qualquer** dado criado na Demo 2.
- ❌ Storage permite escrever em pasta de outra empresa.
- ❌ Backup contém dados misturados de 2 empresas.
- ❌ Edge function devolve dados cross-tenant.

**Se tudo passar**: documentar OK em `.lovable/memory/features/multi-tenant-roadmap.md` e desbloquear Fase 7.
