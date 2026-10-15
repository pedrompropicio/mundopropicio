# TESTES — quadro de testes (fonte única)

> Migrado do Claude Doc `https://claude.ai/code/artifact/941b8db9-67d5-4f4f-ac1a-ce17abfe9146` (rev 48, 15/10/2026). O Claude Doc pode servir de interface auxiliar do 11 - Testes; o que não estiver aqui não conta. Gémeo do `QUADRO.md`: aquele guarda o que falta fazer, este o que falta provar.

## Como funciona

Um teste é uma coisa concreta que alguém viu, ou não viu, acontecer no sistema — nunca "verificar o módulo X". Tem um ecrã, um caminho até lá e um resultado esperado escrito com números ou palavras que aparecem no ecrã. Sem resultado esperado escrito, o teste não entra.

Estados: `[ ]` por correr (implementado, ninguém viu); `[x]` passou (corrido, com data, versão e prova); `[ ]` com linha **FALHOU** por baixo (corrido e partiu — abre-se Issue, regista-se o número, fica por correr até a correcção ser publicada). Um teste que passa não se apaga: fica `[x]` até a próxima implementação tocar naquela área, e aí volta a `[ ]`.

Quem escreve o quê: qualquer chat escreve testes na sua secção quando entrega algo; **11 - Testes** corre, marca, regista a prova e abre as Issues das falhas — é o único que escreve resultados; nenhum chat corrige aqui. Um número só entra no resultado esperado com origem.

Cada resultado leva: data, motor, versão testada (`commit` e `buildId` do `/version.json`), o que passou, o que falhou, e a prova — screenshot (referência ao ficheiro, nunca colado aqui) para o visual, o número que apareceu para o numérico.

## Como se corre

No sistema, pelo browser — nunca por consulta à base a fingir que é o ecrã. A base apura o número que o ecrã devia mostrar; o teste é ver o ecrã mostrá-lo.

| Motor | Quando | Consegue | Não consegue |
|---|---|---|---|
| Chrome, pela extensão | a pedido, com o Pedro presente | sessão real de admin, dados reais | correr com o Mac desligado |
| Chromium no contentor | agendado ou lote longo | corre sempre | sessão de admin do Pedro — precisa de utilizador de teste próprio |

Cadência: só a pedido (24/09/2026); motor por omissão é o Chrome. O caminho Chromium fica por montar até existir um utilizador de teste dedicado na Mundo Propício com papel próprio e credencial em segredo. O ambiente é sempre produção (não há base de Test), por isso **um teste nunca escreve na base**: só lê, navega, filtra e compara. Teste que precise de criar, aprovar ou apagar passa primeiro pelo Pedro, caso a caso, e diz aqui o que deixou para trás.

## Bateria de fumo (corre sempre; F1 primeiro e bloqueia os outros)

- [x] **F1 · O Publish chegou a produção.** `/version.json`: `buildId` e `builtAt` posteriores ao deploy, `commit` igual ao HEAD publicado. — Passou 30/09/2026 (noite), Chrome: commit `eb2b725a8647f2872457447d20f99f000d86b1a8` = HEAD; builtAt 2026-09-30T19:48:15Z; buildId 1790797695909. Nota: mundopropicio.lovable.app redireciona para mpgestaoeventos.com.
- [x] **F2 · Entrar e trocar de empresa.** Login, CompanySwitcher, voltar; dashboard carrega nas duas empresas. — Passou 30/09/2026, Chrome: MP → Coala → MP com toast "Empresa alterada"; MP saldo em caixa 581.998,64 €, posição de vendas com 4 eventos; Coala 98.604,55 €. Consola sem erros. Nota: trocar de empresa devolve ao ecrã de módulos.
- [x] **F3 · As listas grandes não vieram cortadas.** Total do ecrã = total da RPC, ao cêntimo. — Passou 30/09/2026 (tarde), Chrome: Posição de Vendas 19.517 bilhetes · 833.358,25 €, igual à RPC `get_event_ticket_sales_totals`. Ressalva: esse ecrã não mostra cêntimos; o acerto ao cêntimo fica por provar noutro ecrã.
- [x] **F4 · Os ecrãs críticos abrem.** `/eventos`, `/transacoes`, `/contas`, `/conciliacao-bancaria`, `/bilheteiras`, `/vendas`, `/cartoes`, `/relatorios/dre`. — Passou 30/09/2026, Chrome, empresa MP: 8 ecrãs com dados; consola sem erro da aplicação (3 "message channel closed" são da extensão). Observação do ECI anulada na corrida da tarde (leitura errada de screenshot): retido em Bilheteiras = Vendas H&K Madrid = 100.482,25 €.
- [ ] **F5 · Os portais externos abrem.** `/contabilidade` e portal do sócio. — Parcial 30/09/2026, Chrome: portal do sócio passou ("Ver como sócio", Ivete › SUPERSOUNDS: fechamento 60/40, resultado −248.556,43 €, parte −149.133,86 €, base a transferir −125.861,55 €, BP 808.911,25 €). `/contabilidade` por correr até existir utilizador com papel `accountant` (a criar pelo Pedro).
- [ ] **F6 · As invariantes estão limpas.** `/admin/invariantes`: zero `error`, `warn` explicados.
  FALHOU 30/09/2026, Chrome — Issue #265: `documento_sem_ficheiro_no_storage` grave com 9 (referência 8), anexo `fc36ff8f…` da transação "Material de Escritório MP". Avisos fora da referência sem explicação: `emails_presos_pending` 245/214, `tabelas_acima_de_1000` 39/28, `pares_fk_duplicada` 38/35, `secdef_abertas_a_anon` 16/15, `segredos_a_expirar_14d` 1/0, `TX_EVENTO_SEM_RUBRICA` 15/13. Smoke de consultas: 1 falha em 24, `get_partner_bp_realized` "42501: Event access denied" (por apurar se é esperado para admin). _Nota 15/10: o anexo `fc36ff8f…` foi apagado por DML autorizada a 11/10 (#213); recorrer F6._

F1 corre sempre; F2–F6 na íntegra depois de um Publish que toque leitura de dados, por amostragem quando a mudança foi só visual.

## Em fila, por chat

### 2 · Plataforma e Infra
- [ ] **Talão de cartão abre no portal da contabilidade** (#234). Depois de a política do bucket `card-documents` incluir `accountant`: em `/contabilidade`, abrir um anexo `card://` pelo popover. Não corrível hoje: não há documento `card://` em Live.
- [ ] **Apagar um anexo arquiva o ficheiro em vez de o destruir** (#268, depois do Publish de 30/09). Anexar ficheiro descartável a transação de teste, apagar pelo ecrã de Documentos; em Live nasce linha em `storage_deletion_log` e o objecto aparece em `_trash/<data>/…`. Repetir com anexo de nota do BP (`event-forecast-attachments`).
- [ ] **O aviso diário do verificador chega ao WhatsApp** (30/09). Cron `system-reminders-daily` (jobid 1646, `30 7 * * *`); SID do Twilio é aceitação, não entrega. Passa quando chegar a mensagem da corrida automática das 07:30.
- [ ] **O invariante acusa uma perda nova no dia seguinte** (#268). `documento_sem_ficheiro_no_storage` continua em 18 e conforme depois do teste acima.

### 3 · Ticketing e Receita
_(sem testes em fila)_

### 4 · Financeiro e Tesouraria
- [x] **Contas gerenciais fora da vista da contabilista** (#235). — Feito e publicado 23/09/2026 (commit 0e126433, decisão do Pedro: opção 1 — alinhar com o ZIP). Resultado registado no quadro antigo; prova no ecrã por recorrer pelo 11.

### 5 · BP, Verbas e Rateio
- [x] **Linha de BP com fórmula mostra valor e composição — SM Lisboa** (#263). — Passou 30/09/2026, Chrome: 3.836,50 € e "2% × 191 824,95 € (bruta, previsto do simulador)", igual a `formula_params->>'last_calculated'` (recalculado 10:53 UTC). Não provado que o valor não se edita à mão.
- [x] **O mesmo no SM Porto** (#263). — Passou 30/09/2026, Chrome: 4.732,67 € e "2% × 236 633,40 €", igual à base (01:29 UTC). Observação: Lisboa recalculou às 10:53 e Porto não — por apurar o que dispara o recálculo.
- [ ] **Depois do evento a fórmula passa para as vendas reais** (#263). A partir de 03/10 (Lisboa) e 04/10 (Porto): composição deixa de dizer "previsto do simulador"; valor = 2% da receita bruta real, apurada na hora.
- [ ] **Convites: Simulador e A&B mostram os finais num evento realizado** (#263, `selectCourtesyRows`). Coala 2026: 4.150 convites nos dois ecrãs. — Inconclusivo 30/09/2026: Simulador 4.150 (igual à base); A&B não mostra convites em separado; domingo 12.799 vs 12.798 esperado — sobra 1, origem por apurar.

### 6 · Vínculo BP-Transações
- [x] **Publish da #264 chegou a produção.** — Passou 30/09/2026 10:34 UTC: commit `b11cb24bdb74748b3785ca7f9c40ca30cdd6b386`; builtAt 2026-09-30T10:26:44Z; buildId 1790764004005; confirmado no Chrome pelo 11.
- [ ] **Base: despesa de conta marcada na janela exige o evento da janela** (#264, D-ERP150). BEGIN … ROLLBACK, autorizado pelo Pedro a 30/09 (chat 6). Esperado: 10.5 com date na janela sem evento → recusa; com Coala 2026 → recusa; com Coala 2027 → passa; receita do grupo 10 sem evento → recusa.
- [ ] **Base: pagar nunca dispara a trava; filhas e parcelas isentas** (#264). Mesma transacção desfeita.
- [ ] **Base: excepção só com permissão e justificação** (#264). `admin_cost_override_write` sem permissão → recusa; com permissão e justificação → passa e deixa 1 linha em `system_audit_log` (desfeita).
- [ ] **Base: janelas contíguas** (#264). Segunda janela fecha a anterior no dia antes; buraco ou sobreposição → recusa; marcar 10.1.01/10.2.x/10.3.x/10.12.x → recusa.
- [ ] **Invariantes sem escrita** (#264). — Parcial 30/09/2026: 0 contas com `allocate_to_active_event` e 0 eventos com `absorbs_admin_costs` — passou; DRE da MP antes/depois do Publish igual excepto +449,01 € de duas transações lançadas entretanto — passou; DRE do Coala por correr (referência tomada depois do Publish: receitas 1.824.983,48 €, despesas 1.279.114,63 €, resultado 545.868,85 €). _Nota 15/10: o Coala 2027 passou a absorver custos administrativos desde 29/08/2026 por DML autorizada a 11/10 — a referência "0 eventos" mudou._
- [ ] **Ecrã: Plano de Contas, Editar Evento e DRE** (#264). — Parcial 30/09/2026: Plano de Contas 10.1.01 bloqueado com nota — passou; DRE sem texto de absorção — passou; Editar Evento: caixa existe; fim em aberto e janelas vizinhas só ao marcar — fica para o Pedro ver ou autorizar.
- [ ] **Ecrã: Nova Transação com evento pré-preenchido e diálogo de excepção** (#264). Só depois de o Coala estar configurado (já está, 11/10). Nova Transação no Coala, conta 10.x marcada, data ≥ 29/08/2026 → evento Coala 2027; trocar o evento abre pedido de excepção. Cancelar sem gravar.

### 7 · Fecho e Sócios · 8 · Tráfego Pago · 9 · CRM, Portal e Leads
_(sem testes em fila)_

### 10 · Entrada de Dados
- [ ] **Clicar numa linha do BP preenche a transação numa cidade de turnê** (#260). — Parcial 30/09/2026, Chrome do Pedro: formulário encheu-se (2.3.01, 2500 + IVA 23%) e painel fechou — passou; `LocalReinforcementDialog` só aparece ao gravar — não visto (gravar criaria transação real). Falta: a Délia ver no browser dela, ou o Pedro gravar e apagar.
- [x] **Cachê real desconta as despesas antes de calcular** (Simone Mendes, commit 233be79). — Passou 30/09/2026, Chrome: Lisboa deduções Aéreo 20.860,18 € (= 41.720,35 € ÷ 2) e 2.6.07 3.836,50 €; 40% de 153.609,92 = 61.443,97 €; Porto 77.076,07 €. Sem aviso "sem transação". "Antes" não comparado (sem valor anterior registado).

### 11 · Testes · portais · chats de evento
_(sem testes em fila)_

## Histórico de corridas

| Data | Motor | Âmbito | Passou | Falhou | Notas |
|---|---|---|---|---|---|
| 30/09/2026 (noite) | Chrome | Fumo depois do Publish eb2b725a | F1 | — | F2–F6 e #268 por correr (sessão expirada) |
| 30/09/2026 (tarde) | Chrome | Fumo refeita depois do Publish b11cb24b + #264 | F1, F2, F3, F4; #264: Publish, base sem marcas, DRE MP, bloqueio 10.1–10.12 | F6 (#265) | F6 não recorrido ("Correr agora" grava execução); DRE do Coala tomado como referência; 4 testes de base com escrita desfeita ficam para o 0 |
| 30/09/2026 | Chrome | Fumo depois do Publish de 01:31 UTC | F1–F4; F5 só sócio | F6 (#265) | F5 `/contabilidade` espera utilizador `accountant` |

## Por montar

- **Utilizador de teste dedicado** na Mundo Propício, com papel próprio e credencial em segredo. Sem ele não há caminho Chromium nem bateria agendada. Pedido ao 0.
- **Utilizador `accountant`** para o F5. Pedido ao Pedro.

## #320 — CAPI P1 (2026-10-15)
- `src/test/capi-p1-guard.test.ts` — 20 testes, fetch bloqueado (sem egress): 100/33, 2804050, transitório, guarda servidor (suspended, wrong_kind, expired, no_consent, no_identity, wrong_event, not_claimed, erro RPC, resposta inválida, event_time em falta), interruptor, alerta só conta se confirmado.
- Provas Live: `docs/testes/issue320/02-baseline.md`, `04-correcao-lacunas.md` e `05-fecho-tecnico.md`; provas versionadas de tsgo/vitest/build: `06-tsgo.md`, `06-vitest.md`, `06-build.md` no mesmo diretório. Os `.txt` ignorados não contam.

- #320 (15/10/2026): `src/test/capi-diag-no-secrets.test.ts`: o diagnóstico não expõe segredos nem o corpo do Vault. tsgo 0 · vitest 0 (151 ficheiros, 1177 testes passam) · build 0. Provas em `docs/testes/issue320/06-*.md`. CI confirmada independentemente pelo Claude e ChatGPT via conector GitHub: https://github.com/pedrompropicio/mundopropicio/actions/runs/38824514063, job `quality` `116728694956`, conclusion `success`, SHA `7b151756ad8060019de571b9295a6a978e0fbb1e` (confirmado no checkout do log).

- [x] **#320 — P1 validado independentemente; fecho documental autorizado** (Pedro, 15/10/2026 23:49 UTC). CI confirmada independentemente pelo Claude e ChatGPT via conector GitHub: https://github.com/pedrompropicio/mundopropicio/actions/runs/38824514063, job `quality` `116728694956`, conclusion `success`, SHA `7b151756ad8060019de571b9295a6a978e0fbb1e` (confirmado no checkout do log). Todas as etapas verdes: tsgo/vitest/canário runtime verify_jwt/build; 151 ficheiros aprovados +1 skipped, 1177 testes aprovados +1 skipped +11 todo. Canário `crm-meta-create-purchase-audience` → `UNAUTHORIZED_LEGACY_JWT Invalid JWT [401]`, recusa esperada. Comparação independente: 11 corpos SQL repo × Live iguais; grants false/false/true (anon/authenticated/service_role); sent_n 29550, hash `b1738fd8ecdd96d7c54466ad7c81e112` preservado; suspensão true, quatro jobs ausentes. Prova consolidada: `docs/testes/issue320/07-fecho-documental-ci.md`. Sem nova corrida nesta sessão documental; sem Publish, deploy, envios ou retoma. Fecha apenas P1, não P2/P3 nem o projeto CAPI inteiro.
