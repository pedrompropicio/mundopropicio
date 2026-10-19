# #333 fase11 — Gmail no Assistente (LOCAL, indisponível em produção)

19/10/2026, agente Lovable ERP. Base f5019a63 (CI run39314854267 SUCCESS, controller).

## Inspeção dos contratos reais
- A plataforma NÃO tem ligação Gmail própria por utilizador: só referências textuais ("Gmail" pendente no modal; `gmail:false` no status do data-entry). O conector Gmail do construtor seria a conta do construtor, partilhada — recusado por não ser consentimento próprio. Ligação Gmail do ChatGPT não é credencial da plataforma: não usada.

## Entregue (código + testes)
- `_shared/gmail-readonly.ts`: escopo único gmail.readonly; filtros validados (período ≤92 dias, remetente endereço/domínio, assunto literal sem operadores, página ≤20, token de página); cliente só GET em 3 caminhos (listar, ler mensagem sem corpo, anexo); metadados sanitizados como dados; só PDF/JPEG/PNG ≤20 MB; anexo só descarregado após escolha, relendo a mensagem pela parte.
- `data-entry/handler.ts`: ações `gmail_search` e `gmail_import`, admin/manager e empresa canónica; ligação resolvida por utilizador+empresa no servidor. Importação reutiliza staging/recibo/`data_entry_add_document` existentes + nota de origem `gmail:<mensagem>:<parte>`; deduplicação por SHA-256 no lote. Nunca prepara/executa fatura nem transação.
- `index.ts`: `gmail` ausente → capability false, pedidos 503 com mensagem clara.
- Modal: secção "Ou escolher um anexo do teu Gmail" (datas, remetente, assunto, resultados, "Mais resultados", escolha por botão de opção, "Usar o anexo escolhido"); sem ligação mostra "Importar do Gmail ainda não está disponível".
- Testes: `src/test/data-entry-gmail11.test.ts` (11, mocks sintéticos). Suite 1695 PASS/6 skip/11 todo; tipos e deno check OK.

## Não feito
Sem OAuth, inbox/anexos reais, modelo, deploy, DDL, Publish, gates/control alterados (análise/upload false; control fechado).

## Dependências exatas de ativação
1. Decisão do Pedro sobre o mecanismo de ligação por utilizador (App User Connector Google com gmail.readonly, ou OAuth próprio) e consentimento de cada gestor.
2. Armazenamento de tokens por user+empresa, server-only (SQL inerte a rever; não incluído porque depende do mecanismo).
3. Implementar `deps.gmail.reader(user, company)` em index.ts sobre esse armazenamento, com transporte para `gmail/v1`.
4. Deploy só data-entry (0 · Cowork) e prova manual pelo Pedro numa caixa autorizada.
5. Importação depende do upload/preparation já fechado; continua fechado até autorização própria.
