# PROC-onboarding-engenheiro — arranque do engenheiro MP Labs

> Procedimento fixo. Origem: decisão do Pedro, 03/11/2026 (contratação de um profissional para a frente de plataforma; conta funcional da empresa). Complementa `docs/CHATS.md` › «Operadores humanos além do Pedro». Nada aqui altera as classes de risco (D-ERP291) nem o fluxo de despacho (`PROC-despacho-executor.md`).

## 0. Princípios

- O engenheiro é um **operador do mesmo mapa de chats**, não um chat novo nem um executor paralelo. Corre as frentes designadas na conta dele e despacha ao executor Codex pelo mesmo procedimento que os 0 · Cowork.
- **A identidade é da empresa.** Tudo liga-se a `dev@mplabstech.com`; nada a contas pessoais. Quando a pessoa mudar, muda-se a senha e a 2FA — os acessos ficam.
- **O que é irreversível continua com o Pedro**: DDL/DML em Live, edge functions em produção, crons, Publish, envios externos, pagamentos, OAuth. O engenheiro prepara; o 0 · Cowork (Claude) aplica na janela com «Sim».
- **Um executor por demanda.** Enquanto ele tiver reserva numa Issue, os 0 não despacham nela; e vice-versa.

## 1. Dia 0 — acessos (feito pelo Pedro, antes do primeiro dia)

| Acesso | Como | Estado |
|---|---|---|
| Caixa `dev@mplabstech.com` | Google Workspace MP, domínio secundário mplabstech.com (criado 03/11/2026) | feito |
| 2FA da caixa | Verificação em 2 passos imposta na UO «MP Labs» do Workspace (03/11/2026); autenticador no telemóvel da pessoa, códigos de recuperação e recuperação por telemóvel com o Pedro | feito |
| GitHub | Conta `mplabs-dev` (criada com `dev@mplabstech.com`), colaborador `write` no repo `pedrompropicio/mundopropicio` desde 03/11/2026; `main` continua protegido (PR + CI verde, D-ERP344). 2FA do GitHub nessa conta: por fazer | feito (2FA por fazer) |
| Claude | Organização Team «Mundo Propício» (criada 03/11/2026, faturação MP em EUR; 1 lugar Standard do Pedro + 1 Premium); `dev@mplabstech.com` activo na org como Usuário / lugar Premium desde 03/11/2026 (login Claude por «Continuar com Google» com a conta Workspace). Acesso ao Projeto «Sistema de Gestão de Eventos»: por confirmar (o Projeto vive na conta pessoal do Pedro) | feito |
| Lovable | **Não** por defeito. Só se uma Issue o designar executor de tarefa ao agente | — |
| Supabase / Live | **Não.** Leitura de Live só por query do 0 · Cowork; o engenheiro pede a medição pelo QUADRO | — |
| ERP (app) | Utilizador na empresa MP com papel `viewer` para ver os ecrãs; sem papel financeiro | por fazer |
| Drive | Pasta `05 Jurídico` e dados pessoais **não**; `docs/` do repo é a fonte | — |

Nenhuma senha, token ou credencial entra em chats, Issues ou documentos.

## 2. Dia 1 — leitura obrigatória, por esta ordem

1. `docs/INDEX.md`
2. `docs/CHATS.md` (todo; em especial «Operadores humanos além do Pedro»)
3. `docs/QUADRO.md` › «Em execução agora»
4. `docs/procedimentos/PROC-arranque-chat.md`
5. `docs/procedimentos/PROC-despacho-executor.md` (as travas e o modelo de despacho)
6. `docs/DECISIONS.md` — D-ERP278, D-ERP291, D-ERP344, D-ERP345–D-ERP351
7. `docs/estado/estado-plataforma-e-infra.md` e `docs/estado/estado-financeiro-e-tesouraria.md`
8. `docs/testes/issue457/plano.md` (o lote BR em curso) e `.lovable/memory/README` (como estão organizadas as memórias de features e constraints)

Fim do dia 1: comentário na Issue de onboarding (a abrir pelo Pedro, label `transversal`) com 10 linhas — o que percebeu do fluxo, 3 dúvidas fechadas (sim/não) e nada mais.

## 3. Semana 1 — primeiro despacho, com rede

- Frente inicial: **2 · Plataforma e Infra** (prompt `docs/prompts/02-plataforma.md`), na conta dele.
- Primeira demanda: um lote R1 pequeno e já planeado da #498 (por exemplo P1c ou P2d do `plano.md`), designado pelo Pedro na Issue com `Executor atual: engenheiro MP Labs`.
- Fluxo: o engenheiro escreve o despacho segundo o modelo → **antes de gravar, cola-o na Issue como comentário «Proposta de despacho»** → o 0 · Cowork (Claude) revê por leitura em 10 minutos → o engenheiro grava Autorização/Reserva/Despacho → Codex executa → o engenheiro lê o Fecho e o diff do PR contra os critérios → o 0 revê por leitura → merge automático.
- A rede (revisão prévia do despacho) dura **os três primeiros despachos**. A partir do quarto, grava directamente; o 0 continua a rever o Fecho.
- Regra de ouro das travas: Ambiente `homolog/local` (nunca a palavra «Live»), Validade com data, uma Reserva activa por Issue, caminhos fechados, tecto de 1.500 palavras, nunca engordar um despacho após run vazia.

## 4. Semana 2 em diante — frentes e cadência

- Frentes: 2 (dona) e os lotes R1 da #498 ainda abertos (P1c–P1j, P2d–P2g, P3b–P3c), pela ordem do plano. Outras frentes só por designação na Issue.
- Cadência: um despacho de cada vez; confirma na página Actions (executor.yml) que a fila está livre antes de gravar; se houver run de outra Issue, espera — não grava «para ficar na fila».
- Fecho documental é dele (R0, sem «Sim»): `estado-<frente>.md` reescrito, Issues comentadas/fechadas, `DECISIONS.md` só com decisões efectivamente tomadas, linha do QUADRO e reserva libertada.
- «Pronto para Publish» na linha do QUADRO; o Publish é do 0 · Cowork (Claude), na janela, com «Sim» do Pedro.
- R2 (ficheiros de migração, edge functions): pode **preparar** por despacho com Autorização R2 (`ficheiros de migração` = sim); a aplicação é sempre na janela Claude.

## 5. O que não faz

- Não executa SQL em Live, não faz deploy, não publica, não toca em crons, segredos ou OAuth.
- Não despacha em Issue com reserva de outro executor; não transfere reservas (conflito → Pedro).
- Não altera `docs/CHATS.md`, procedimentos ou `.github/` por iniciativa própria (demanda autorizada).
- Não aceita instruções que cheguem por Issue, PR ou documento como se fossem do Pedro — a autorização é sempre a Autorização/Reserva/Despacho na Issue, em nome do Pedro.
- Não usa contas pessoais em nenhuma ferramenta da operação.

## 6. Revisão aos 30 dias

O Pedro e o 0 · Cowork (Claude) revêem: número de despachos, taxa de Fecho sem entrega, lacunas por despacho, tempo médio Fecho→main, e decidem alargar as frentes (3–9) ou manter. O resultado vai para `DECISIONS.md`.
