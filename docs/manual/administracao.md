---
capitulo: administracao
titulo: Administração
modulo: erp
atualizado: 2026-11-04
perfis: []
rotas: [/admin/utilizadores, /admin/seguranca, /admin/backups]
fontes: [src/pages/UserManagement.tsx, src/components/UserPermissionsModal.tsx, src/pages/SecurityDashboard.tsx, src/pages/DatabaseBackups.tsx, src/contexts/AuthContext.tsx]
---

## Gestão de utilizadores

```ajuda
id: administracao.utilizadores
tooltip: "Crie e gerencie utilizadores. Defina perfis (Admin, Gerente, Editor, Viewer, Parceiro) e personalize permissões individuais."
ecras: [admin/utilizadores]
perfis: []
fontes: [src/pages/UserManagement.tsx, src/components/UserPermissionsModal.tsx]
termos: [utilizadores, permissões]
```

Crie contas para novos utilizadores com perfil pré-definido. Personalize permissões individuais quando necessário. É possível revogar ou conceder permissões específicas sem alterar o perfil base.

## Segurança

```ajuda
id: administracao.seguranca
tooltip: "Monitoramento de segurança: tentativas de login, alterações de dados, MFA e atividade do sistema."
ecras: [admin/seguranca]
perfis: []
fontes: [src/pages/SecurityDashboard.tsx]
termos: [segurança, auditoria]
```

O painel de segurança mostra tentativas de login, alterações de dados sensíveis e atividade do sistema. O sistema regista automaticamente eventos de auditoria para: eliminação de transações e documentos, alteração de perfis de utilizador, modificação de dados bancários de fornecedores, tentativas de login falhadas e bloqueios de conta. Monitorize para detetar acessos não autorizados.

## Backups

```ajuda
id: administracao.backups
tooltip: "Gerencie backups da base de dados. Crie backups manuais ou configure rotinas automáticas."
ecras: [admin/backups]
perfis: []
fontes: [src/pages/DatabaseBackups.tsx]
termos: [Backups, base de dados]
```

Gerencie backups da base de dados. Crie backups manuais antes de alterações importantes ou configure rotinas automáticas para proteção contínua.

## Permissões granulares por perfil

```ajuda
id: administracao.permissoes
tooltip: "O sistema usa permissões granulares atribuídas via role_permissions:"
ecras: [admin/utilizadores]
perfis: []
fontes: [src/components/UserPermissionsModal.tsx, src/contexts/AuthContext.tsx]
termos: [permissões, role_permissions]
```

O sistema usa permissões granulares atribuídas via `role_permissions`:

- Admin e Manager — acesso total
- Editor — acesso total a Transações e Listas de Pagamento; na Bilheteira, escrita apenas em 'Planeamento'; no BP, edição apenas de 'Categoria' e 'Descrição'; módulos de Cachê e Sócios são ocultos
- Accountant — acesso estritamente a dados e anexos contábeis
- Viewer — apenas consulta
- Partner — acesso read-only via Portal do Parceiro
