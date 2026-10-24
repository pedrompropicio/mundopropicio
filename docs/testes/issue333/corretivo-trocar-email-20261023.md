# #333 — Corretivo R1: escolher outro email na conversa (23/10/2026)

Base comum confirmada: 0ea14177d65f03e046468224ad1fca82eaf86276 (diferença local = só ficheiros desta tarefa). Sem deploy, Publish, DDL, DML, flags, janela, login ou chamadas reais de IA/Gmail/scanner. Só dados sintéticos.

## Causa (confirmada no código)
- Ecrã: após uma revisão, todo o texto livre seguia com a continuação antiga.
- Servidor: `chosen = selection ?? resume.message ?? texto` → a escolha anterior ganhava sempre ao texto novo e o contrato `chosen_message` forçava novo `gmail_read` do mesmo email.

## Correção
- Botão **Escolher outro email** (só enquanto a continuação assinada está em memória) envia `intent: "list"`. Servidor: verifica assinatura (user/empresa/expiração/hash do pedido ORIGINAL), revalida a pesquisa e devolve os cartões. Zero chamadas de IA, zero leituras.
- Pedidos claros de listar/trocar ("mostra as mensagens encontradas", "outro email", "email errado") seguem o mesmo caminho determinístico.
- Nova escolha inequívoca (cartão, número, assunto, ou só hora quando um único candidato a tem) prevalece sobre a anterior. Só IDs da lista assinada ∩ pesquisa revalidada; IDs novos na caixa que não estavam assinados não entram na próxima assinatura.
- Texto livre sem escolha: a revisão anterior mantém-se, o modelo recebe `previous_message` (não `chosen_message`) e um pedido de `gmail_read` termina sem ler. Assunto novo → pesquisa nova; a próxima assinatura liga-se ao texto atual (`continuation_rebound`).
- Trocar de email retira logo a revisão/proposta/candidato anterior do ecrã; respostas tardias são descartadas pela geração.
- Cartões: "Anexos: N PDF, M imagens / Sem anexos" a partir dos metadados do servidor.

## Contagens no percurso "pedir a lista depois de A" (mocks locais)
- Antes: 1 revalidação + ≥2 chamadas de IA + 1 leitura Gmail de A (e mostrava de novo os anexos de A).
- Depois: 1 revalidação + 0 IA + 0 leituras.
- Tempo medido no teste local com mocks: < 1 s (inclui só código local). Não é medição de produção; a latência real depende do Gmail e não foi medida.

## Provas
- 12 testes novos: `src/test/data-entry-assistant333-trocar-email.test.ts` (8) e `...-ui.test.tsx` (4): lista sem IA/leitura, contagens 14 imagens vs 4 PDF, B com anexos reais, texto por assunto/hora supera A, texto novo não relê A, assunto novo reassina, IDs forjados/expirados/outra empresa/token adulterado/pedido trocado recusados (409), resposta tardia de A descartada, nada sensível no armazenamento local.
- Suite COMPLETA final: 2405 PASS, 6 skipped, 11 todo (antes 2393). tsgo OK; deno check data-entry OK; build automático OK.

## Limites
- Depois de atualizar a página o botão desaparece (a continuação só vive em memória, de propósito).
- Deploy apenas de `data-entry` autorizado expressamente pelo Pedro e executado uma vez em 24/10/2026 (registo abaixo). Não houve Publish do ecrã nem teste real do percurso; funcionamento servido não verificado nesta tarefa.
- Controller confirmou CI40040260795 completed/success no SHA autorizado `4bb490caf31eeb5a64fc4b9108b2fc350f7195a1` antes do despacho; CI do fecho documental fica para conferência própria do controller.

## Deploy R2 — 24/10/2026
- Autorização expressa do Pedro nesta sessão: "Autorizo" ao deploy apenas de `data-entry`, mantendo lançamentos bloqueados e janela no estado atual. Pré-condições GitHub main=Lovable e agentFinished=true confirmadas pelo controller; HEAD local conferido igual a `4bb490caf31eeb5a64fc4b9108b2fc350f7195a1`, sem alterações locais antes do deploy.
- UMA chamada oficial: `deploy_edge_functions({"function_names":["data-entry"]})`. Resposta integral:

```text
Successfully deployed edge functions: data-entry
Submitted source SHA-256 (files and settings; live verification is reported separately):
data-entry source_sha256: 02818b58c4d680ede34ca0e1aab2d0e6ae07f0d7e472fa4b092ccef92a2cf2ed
```

- Hora observada: início da preparação final 2026-10-24 00:01:23 UTC; conclusão já recebida antes da consulta de 00:01:48 UTC. A ferramenta não devolveu ID, versão ou hora própria do deploy. Hash de fonte+config submetida NÃO prova bytes servidos (#317); nenhuma invocação da função foi feita para provar versão.
- SELECT mínimo pós-deploy, só agregados de controlos:

```sql
SELECT now() AS checked_at,
  (SELECT count(*) FROM public.data_entry_assistant_executor_settings_333) AS executor_control_rows,
  (SELECT count(*) FROM public.data_entry_assistant_executor_settings_333 WHERE enabled) AS executors_enabled,
  (SELECT count(*) FROM public.data_entry_assistant_scope_333 WHERE expires_at > now()) AS active_windows,
  (SELECT count(*) FROM public.data_entry_analysis_control_333) AS provider_control_rows,
  (SELECT count(*) FROM public.data_entry_analysis_control_333 WHERE active_claim IS NOT NULL) AS provider_claims,
  (SELECT count(*) FROM public.data_entry_analysis_control_333 WHERE stage = 'idle') AS providers_idle;
```

```text
[map[active_windows:0 checked_at:2026-10-24 00:01:48.454039+00 executor_control_rows:1 executors_enabled:0 provider_claims:0 provider_control_rows:1 providers_idle:1]]
```

- Executor desligado; zero janelas ativas (estado anterior preservado); único provider sem claim e em stage idle. Não serializadas rows inteiras. pending_requests=0 era pré-condição verificada pelo controller; não reconsultado nesta consulta mínima.
- Sem código, Publish, outros deploys, DDL/DML/flags, login, abertura/renovação/revogação de janela, chamadas reais IA/Gmail/scanner, PDFs privados ou efeitos financeiros. Sem comentários Issue por canal alternativo, INDEX ou branches. Reserva #333 MANTIDA para controller verificar por consulta própria; nenhuma reabertura autorizada.
- Questões/decisões em aberto: nenhuma decisão nova para Pedro; verificação independente do controller e eventual Publish dependem do respetivo despacho. Não repetida a suite: código inalterado, CI técnico autorizado já confirmado pelo controller.
