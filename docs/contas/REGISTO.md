# Registo de contas e subscrições de plataformas — Mundo Propício

Fonte única das contas de plataformas da empresa. **Nunca** contém passwords, tokens, chaves, números de cartão ou connection strings — só identidade de login, plano, ciclo, custo e quem é owner. Segredos vivem nos gestores de passwords e nos cofres (Supabase Vault, GitHub Actions secrets).

Regras (D-ERP309 e esta página):
- Toda a conta nova da empresa entra aqui no dia em que é criada, com origem (fatura, email de confirmação).
- Emails de confirmação, faturas e recibos: etiqueta Gmail `Contas/Plataformas` em `pedroneto@mundopropicio.com` e reencaminhamento para a caixa partilhada **`contas@mundopropicio.com`** (Google Group, caixa de entrada colaborativa, criada 25/10/2026; owner Pedro; externos podem enviar; entrada só por convite).
- Faturas com IVA/NIPC: seguem para a contabilidade (Expert Numbers) pelo fluxo financeiro habitual.
- Números que mudam (custos, créditos) consultam-se na plataforma; aqui fica o último valor com data.

## Contas activas

| Plataforma | Identidade / login | Entidade / org | Plano | Ciclo | Custo (última origem) | Owner | Notas |
|---|---|---|---|---|---|---|---|
| Google Workspace | `pedroneto@mundopropicio.com` (admin) | domínio `mundopropicio.com` | a confirmar | — | — | Pedro | Grupos: `contas@` (caixa colaborativa, 25/10/2026), `api@` (API Fever MP) |
| GitHub (conta pessoal) | `pedrompropicio` · email principal `pedroneto@mundopropicio.com` (desde 25/10/2026) | repos `mundopropicio` (público) e `mundopropicio-replay` (privado) | Free | — | 0 | Pedro | Gmail pessoal mantido como email secundário de recuperação |
| GitHub Organization | `mundopropicio` | Mundo Propício Unipessoal Lda · contacto `pedroneto@mundopropicio.com` | Free | — | 0 | Pedro (owner) | Criada 25/10/2026, vazia; transferência dos repos planeada para depois do G2 da #352 (D-ERP309) |
| Supabase | login GitHub `pedrompropicio` · email `pedroneto@mundopropicio.com` | org `Mundo Propício` (slug `mugcbktatsidtwqnfval`) · Company, 10–49 | **Pro** | mensal | $25/mês + uso (fatura 25/10/2026) · spend cap **ligado** | Pedro | Projecto `mp-homolog` ref `lletodraoaruvmzyecac`, West EU (Ireland) eu-west-1, Nano, Healthy. Faturação como empresa com NIPC. Password da base no gestor de passwords do Pedro |
| ChatGPT Business (OpenAI) | `pedroneto@mundopropicio.com` | workspace **`Mundo Propicio`** (sem acento, criado 23/10/2026) | Business · 1 Premium (Pedro) + 1 Padrão (livre; passa a 1 lugar a 23/11) | mensal, ciclo dia 23 | R$ 319,80 (23/10) + Premium +1 R$ 625,13 (24/10); créditos R$ 494,91 + R$ 439,92 (24/10), saldo ≈ R$ 508 em 25/10; recarga automática ligada | Pedro (Proprietário) | Faturado em R$ a entidade PT com IVA 23% — acrescentar NIPC como Tax ID em Billing; rever recarga automática ao fim de 1 semana com Premium |
| ChatGPT Business — **duplicado cancelado** | `pedroneto@mundopropicio.com` | workspace `Mundo Propício` (com acento, criado 24/10/2026 por engano) | Business · cancelado 25/10, desactiva a 24/11/2026 | — | R$ 959,40 (fatura CNMX5UAR-0001) — **reembolso pedido ao suporte OpenAI em 25/10/2026, escalado a agente humano** | Pedro | Não usar. Acompanhar resposta do suporte por email |
| Lovable | `pedroneto@mundopropicio.com` | workspace `yea5nsHAWxcTKcEaOfV1` | a confirmar | mensal | recibo 16/10/2026 (Lovable Labs #2638-1006-8866); top-ups automáticos com limite mensal | Pedro | Projectos: ERP `ab7cf7e3`, Portal MP `26b95793`, Newgang `1a915f50`, Coala `bef9c59c`, Gestão Artística `c5fbb3d2` |
| Anthropic (Claude) | `pedroneto@mundopropicio.com` | — | a confirmar | — | recibos 25/09, 10/10 (×4), 17/10, 24/10/2026 | Pedro | Operação partilhada Claude/ChatGPT (D-ERP278) |
| Jon Loomer Digital (PHC Elite) | `pedroneto@mundopropicio.com` | — | assinatura | — | $147,00 (17/10/2026) | Pedro | Aprendizagem do auditor de tráfego |
| browserless.io | `pedroneto@mundopropicio.com` | — | a confirmar | — | recibo 18/10/2026 (#2324-7530) | Pedro | Confirmar se ainda é necessário |
| ElevenLabs | `pedroneto@mundopropicio.com` | — | a confirmar | — | recibo 26/09/2026 (#2406-4033-1695) | Pedro | Confirmar se ainda é necessário |

## Pendentes

- Gmail de `pedroneto@`: adicionar `contas@mundopropicio.com` como endereço de encaminhamento (confirmar o código que chega ao grupo) e criar o filtro `from:(openai.com OR supabase.com OR github.com OR lovable.dev OR anthropic.com OR stripe.com)` → encaminhar para `contas@` + etiqueta `Contas/Plataformas`.
- OpenAI: Tax ID (NIPC) no Billing do workspace `Mundo Propicio`; resposta do suporte ao reembolso CNMX5UAR-0001.
- Completar plano/custo de Google Workspace, Lovable, Anthropic, browserless, ElevenLabs a partir das faturas etiquetadas.
- Meta, Google Ads, TikTok, Fever, Ticketline, BOL e restantes contas operacionais: inventariar na revisão semanal (PROC-revisao-semanal).

_Última actualização: 25/10/2026, 0 · Cowork (Claude). Origem: dashboards Supabase/OpenAI/GitHub/Google Admin vistos nesta data e emails etiquetados._
