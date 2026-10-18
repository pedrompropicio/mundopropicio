# #333 — fecho documental manual76

## Resultado: TESTE MANUAL OPERACIONAL APROVADO

Fonte: relato de Pedro e verificação independente do controller, enviados em18/10/2026 20:36UTC; não houve nova consulta ou execução pelo agente nesta tarefa. HEAD inicial confirmado no checkout:65da5dabee1da961bb2f4a7b36ab82abf2899866.

Pedro comunicou captura17:36Fortaleza: modal “Estado: Concluído”, resultado “Registado e conferido”, uma fatura fictícia EUR0/IVA0, PDF anexado e autorização nominal/data do perfil autenticado. Ausência de “Conferir novamente” quando já conferido é esperada. Não é necessário novo lote, clique ou execução.

Controller confirmou pelo conector oficial:1fatura/1resultado; duas permissões desativadas; core_open0/attempt_open0. Comparação AUTOMÁTICA com baseline76 anterior, sem excluir owner:
- transactions, event_forecasts, financial_accounts, transaction_payments, reimbursement_notes, reimbursement_note_items e payment_lists: count+hash IDÊNTICOS.
- Configuração18funções: ACL/source/owner idênticos.
- Deltas esperados:+1sessão/documento/prévia/resultado/fatura/tentativa/auditoria e+2receipts.

Envelopes antes/depois preservados pelo controller; não transcritos, regenerados ou alegados como consumidos pelo receiver do agente. Nenhum dado pessoal individual publicado.

## Renovação e revogação — esclarecimento77

Controller informou renovação das mesmas duas permissões durante o teste, depois de Pedro esclarecer que os campos eram funcionais; nova expiração20:28:32UTC, seguida de revogação explícita pelo controller. O filtro77 pelo primeiro expires20:14:29 não deveria coincidir. A diferença está explicada, não demonstra drift nem justifica retry. Não houve promoção, alteração de perfil, ban ou logoutglobal; conta e sessões históricas preservadas.

## Checklist operacional / atualização para Issue333

- [x] Upload do PDF fictício aprovado,1517B; SHA do documento observado igual ao original aprovado.
- [x] Prévia EUR0/IVA0 e referência fictícia exclusiva.
- [x] Autorização explícita nominal/data do perfil autenticado.
- [x] Execução única suportada pela UI,1fatura/1resultado.
- [x] Conferência operacional “Registado e conferido” / “Concluído”.
- [x] Baseline financeira/configuração preservada na comparação automática do controller.
- [x] Duas permissões fechadas; gates globais0; conta/sessões históricas preservadas.
- [ ] Aceitação ampliada: request de check autenticado comprovadamente iniciado APÓS revogação. Captura posterior não prova hora do request.
- [ ] Aceitação ampliada: duas requisições HTTP simultâneas de execute sobre a MESMA prévia. UI não oferece esse ensaio; não houve duplo clique.
- [ ] Aceitação ampliada: download separado dos bytes finais e comparação SHA. SHA do documento observado não equivale a novo download certificado.

Sucesso manual aprovado NÃO equivale à certificação automatizada ampliada. Fases1–7done/8PARCIAL/9–18pendentes. Para encerrar8 sob os critérios originais faltam somente as três evidências específicas acima, ou decisão expressa de aceitação que dispense esses critérios. Não pedir novo piloto/conta/repetição para reconhecer o sucesso já obtido.

## Próximo produto útil

**Correção79 — ordem original confirmada por Pedro:** fase9 é disponibilização/publicação inicial restrita; análise documental/OpenAI pertence à10. A sugestão abaixo permanece como histórico78 com rótulo incorreto, não como alteração do plano. Ver `79-proposta-fase9-restrita.md`.

Proposta para fase9, ainda não executada: análise do PDF para sugerir campos e apresentar proveniência na prévia, sempre sujeita a revisão e autorização humana, sem lançamento automático ou efeitos financeiros. Não afirmar que esta proposta redefine a numeração do checklist externo. Implementação/integrações e Publish continuam dependentes de autorização própria.

## Fecho

Somente documentação alterada; sem testes, produto, Cloudwrites, consultas, login, conta, reativação, execução, DDL, deploy ou Publish. #323/DECISIONS/AGENTS preservados; reserva333 libertada no fecho. Checklist e texto para Issue333 registados aqui; não alegar edição da Issue remota sem ferramenta de escrita disponível.