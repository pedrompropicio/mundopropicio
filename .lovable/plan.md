
# OP-19 — Plano AJUSTADO (modelo "nível Operacional" confirmado)

## Respostas à investigação

### 1) `is_operacao_only` hoje

- **Coluna**: `profiles.is_operacao_only boolean NOT NULL DEFAULT false` (migração 2026-05-21).
- **Quem escreve**: só `onboarding-bulk-import` (default `true`). `create-staff` e `create-user` **não tocam** no campo.
- **Quem lê**: apenas `useIsFieldStaffOnly` → consumido **só** em `AppSidebar.tsx` (filtra itens que não começam por `/operacao`).
- **Gating real**: não há guarda de rota. Um user `is_operacao_only=true` que digite `/admin` ou `/eventos` directamente **passa**, sujeito apenas às permissões/RLS normais. Hoje a barreira efectiva são as permissões (`view_operacao` vs `view_bp` etc.) — o flag é cosmético/sidebar.

### 2) Edge functions de criação

| Função | profile_type | is_operacao_only | role atribuída |
|---|---|---|---|
| `create-user` | `'user'` (default) | **não escreve** (fica `false`) | role escolhida (admin/manager/editor/viewer/user/partner) |
| `create-staff` | `'field_staff'` | **não escreve** (fica `false`) | `field_producer` |
| `onboarding-bulk-import` | configurável | **escreve, default `true`** | configurável |

→ Para a área Equipa cumprir o modelo do Pedro, **as duas edges principais (`create-user`, `create-staff`) precisam de aceitar `is_operacao_only`** e a UI tem de passar `true` sempre que cadastra pela /operacao/equipa.

### 3) Roles vs is_operacao_only

- Modelo desejado:
  - Produtor de evento: `user_roles.role='producer'` + `is_operacao_only=true`
  - Field staff: `role='field_producer'` + `is_operacao_only=true`
  - User pleno (BP, etc.): `role∈{admin,manager,editor,viewer}` + `is_operacao_only=false`
- Não há conflito formal — são eixos independentes. Risco: hoje `producer` tem permissões plenas de Operação (ver seed), mas se for promovido a admin/manager **e ficar com `is_operacao_only=true`**, fica "preso" à sidebar de Operação mesmo tendo permissão para tudo. ⇒ **Regra a documentar**: ao promover alguém para admin/manager/editor no Admin, repor `is_operacao_only=false` automaticamente (ou avisar).

### 4) Pertença ao evento

Dois canais, ambos válidos:
- `event_team_members(event_id, profile_id, role)` — papéis "macro" no evento (general_producer, director, coordinator, producer).
- `operacao_frente_team(frente_id, profile_id, ...)` onde `frente.event_id = X` — pertença via frente concreta.

Pessoa `is_operacao_only=true` cadastrada mas sem nenhuma das duas ligações fica **"solta"** — não aparece em `PessoasList` actual (que parte de frentes/etapas). Precisa de uma vista explícita "produtores da empresa" para não desaparecer.

---

## Ajustes ao plano OP-19

### Modelo confirmado e implicações na UI

- A área **/operacao/equipa cadastra SEMPRE com `is_operacao_only=true`**, qualquer que seja o tipo (producer ou field_staff).
- Mensagem clara no botão "+ Nova pessoa" e no header da sheet de edição: *"Pessoas da Operação. Para acesso ao BP, contabilidade ou outros módulos, criar no Admin → Utilizadores."*
- Listagem na tab **Pessoas** filtra `profiles.is_operacao_only=true AND company_id = empresa_activa` (não mistura com utilizadores plenos). Filtro opcional "Só do evento X" usa união `event_team_members ∪ operacao_frente_team`.
- Edição inline pode mudar nome/telefone/email e papel-Operação (producer vs field_producer), **não** promove a admin/manager/editor — isso fica no Admin.

### Estrutura final das 3 fases (mantida, com sub-passos novos)

#### DISP-G — Tabs + ponto de entrada (≈30–45 min, pré-Coala)
Sem alterações face ao plano anterior. Sidebar perde "Staff", `/operacao/equipa` ganha 3 tabs (Pessoas, Por Zona/Serviço, Field Staff).

#### DISP-H — CRUD + associações multi-frente + `is_operacao_only` (≈2h, pré-Coala se possível)

Sub-passos:

1. **Edge `create-user`** — aceitar `is_operacao_only?: boolean` no body, escrever em `profiles` no INSERT inicial e também no caminho `attach`. Default `false` (não mexe em chamadas existentes do Admin).
2. **Edge `create-staff`** — sempre escrever `is_operacao_only=true` (não há cenário em que field_staff seja user pleno).
3. **UI `NewPessoaMenu`** na tab Pessoas:
   - "Convidar produtor" → `NewProfileInlineDialog` com role fixo `producer` e `is_operacao_only=true` (esconder o select de role; quem quiser admin/manager vai ao Admin).
   - "Cadastrar Staff de Campo" → `NewStaffDialog` (já cria `field_staff`, agora com flag).
4. **`PessoaSheet`** — edit inline, associar/desassociar frentes (multi), marcar primário; chama `addFrenteLead/removeFrenteLead/setPrimaryLead` existentes.
5. **Listagem tab Pessoas** — query base `profiles.is_operacao_only=true` na empresa activa, com merge das contagens por evento (quando filtro de evento activo).
6. **Trigger UI (não DB)** — ao promover via Admin para admin/manager/editor/viewer, oferecer reset de `is_operacao_only`. (Pode ficar para I se faltar tempo.)
7. **`NewProfileInlineDialog` reutilizado fora da Equipa** mantém comportamento actual (flag opcional, default `false`).

#### DISP-I — Polimento (pós-Coala)
- Vista inversa inline na "Por Zona/Serviço".
- Banner "Pessoa com associações activas" ao arquivar.
- Métricas no topo.
- Auto-reset `is_operacao_only` quando role pleno é atribuído no Admin.
- Migração leve opcional: back-fill de `is_operacao_only=true` em todos os profiles com `profile_type='field_staff'` (limpa o gap criado por `create-staff` não ter posto a flag). Idempotente, baixo risco.

---

## Mudanças nas edge functions (resumo)

| Edge | Mudança | Risco |
|---|---|---|
| `create-user` | + parâmetro opcional `is_operacao_only` (default false); aplicar no INSERT do profile e no path `attach` | Baixo — backward compatible |
| `create-staff` | Forçar `is_operacao_only=true` no upsert do profile | Nulo — só endurece o que já deveria ser |
| `onboarding-bulk-import` | Sem mudança (já suporta) | — |

---

## Avaliação: modelo coerente e seguro?

**Coerente — sim.** O eixo `is_operacao_only` é ortogonal a roles/permissões e tem semântica clara: "este perfil é gerido pela Operação, não pelo Admin de Sistema".

**Armadilhas a registar:**

1. **Hoje a flag é apenas cosmética** (filtra sidebar). Se quisermos isolamento real, futuramente um `RouteGuard` que redirecciona para `/operacao` quando `is_operacao_only=true && rota não começa por /operacao` — fica como nota para I ou um OP-20 dedicado a hardening.
2. **`create-staff` não pôs a flag até hoje** — qualquer field_staff actual tem `is_operacao_only=false`. O hook `useIsFieldStaffOnly` ainda os apanha pelo fallback `profile_type='field_staff' + só role field_producer`, por isso não há regressão visível, mas convém o back-fill do DISP-I.
3. **Promoção a role pleno** sem reset da flag deixa users "presos" à sidebar de Operação. Documentar e/ou automatizar.
4. **RLS**: a flag não entra em nenhuma policy hoje. Não é gate de dados — não criar essa expectativa.

Sem armadilhas críticas. Pronto para arrancar DISP-G assim que confirmares.

## Espero confirmação para arrancar

1. OK em forçar `is_operacao_only=true` em **toda** criação pela /operacao/equipa (sem opção contrária na UI)?
2. OK em remover o item "Staff" do sidebar já em DISP-G (vira tab dentro da Equipa)?
3. OK em **bloquear** arquivar/excluir de producers (user normais) pela Equipa — mandar para Admin — e só permitir arquivar field_staff?
