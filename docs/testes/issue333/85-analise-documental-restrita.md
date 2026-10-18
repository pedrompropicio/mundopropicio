# #333 — tarefa85: código fase10, não disponibilização

## Entrega e fronteira
Código preparado para documento já enviado → análise estruturada → candidatos com trecho/página/confiança/incerteza → revisão explícita humana → formulário e prévia existentes. A análise não recebe ferramentas de escrita, SQL, administração, pesquisa externa, finanças ou autorização. Pagador/conta/evento não constam do schema. IVA/moeda ausentes não são inferidos; montantes não EUR e IVA superior ao total não são transferíveis.

Documento, encontrado no ERP (somente NIF da empresa autorizado), sugestão e confirmação humana aparecem separados. Trecho/página são referências propostas pelo modelo, NÃO uma prova OCR independente. Aplicar candidato não autoriza execução: invalida a prévia/checkbox anteriores. Conversa só no lote aberto, em memória; nada é persistido automaticamente. A autorização nominal/hash/empresa e conferência anteriores permanecem no fluxo existente.

`ANALYSIS_ENABLED=false` e `ANALYSIS_PROVIDER_REVIEWED=false` no servidor. Preparação/execução/upload não ativam análise. Sem estas guardas e configuração revisadas, o caminho informa indisponibilidade e não chama o modelo. Nenhuma fase9 liberada, nenhuma fase8 dispensada.

## Arquivos
- `supabase/functions/_shared/data-entry-analysis.ts`: contrato puro, validação e limites.
- `supabase/functions/_shared/issue333-ai/{provider,responses,run-id}.ts`: SDK6 OpenAI Responses servidor, helpers oficiais, modelo documentado, sem migração de outras integrações.
- `supabase/functions/data-entry/{analysis-service,analysis-stream}.ts`: identidade/papel/preparation/owner/empresa, bytes/hash/tipo e revalidação após análise; SDK SSE com resposta final validada.
- `supabase/functions/data-entry/{handler,index}.ts`: ação enumerada e integração atrás de dois gates fechados.
- `src/lib/{data-entry-analysis,data-entry-client}.ts`: contrato UI, aplicação humana e transporte SDK.
- `src/components/data-entry/{DocumentAnalysisPanel,DataEntryDialog}.tsx`: revisão/conversa e invalidação da prévia.
- AI Elements conversation/message/prompt-input/shimmer, seus auxiliares UI e variante button icon-sm compatível; sem substituição dos componentes existentes.
- Testes próprios85 e `supabase/functions/data-entry/AGENTS.md`; regra estrutural resumida no AGENTS raiz dentro do orçamento.

## Limites e segurança
PDF/JPEG/PNG, análise até5MiB (upload existente até20MiB); validação de assinatura/estrutura existente e SHA256/tamanho/caminho determinístico. Mensagem2000bytes, até8turnos, histórico12000bytes, saída6000tokens,8campos/12avisos. Uma chamada por ação explícita, sem retries automáticos, tarefas de fundo ou timer-abort novo; Stop propaga AbortSignal. Não há garantia de preço fixo ou duração máxima: depende do serviço e a disponibilidade está fechada.

O provider usa streaming upstream; o navegador recebe SSE desde o início e apenas campos finais validados. Sem raciocínio/documento bruto transmitido à UI. A resposta segura do serviço é preservada quando disponível; resposta vazia/inválida, recusa, cancelamento e contexto alterado não produzem sucesso. Nenhum erro permite fallback de modelo ou novo envio automático.

## Validação realmente executada
Comando local:
```text
bunx vitest run src/test/data-entry-analysis-transport85.test.ts src/test/data-entry-analysis85.test.ts src/components/data-entry/__tests__/DocumentAnalysisPanel.test.tsx src/components/data-entry/__tests__/DataEntryDialog.test.tsx src/test/data-entry-pilot8.test.ts
Test Files 5 passed (5)
Tests 52 passed (52)
```
Provider/Storage/Auth/HTTP substituídos por doubles locais; fixture PDF somente em memória, nunca ERP. Casos: gate/configuração/papel/permissão, cross-owner/empresa/path, SHA/MIME/tamanho, revogação/mudança NIF/MIME/hash durante geração, cancelamento, campos proibidos, moeda/IVA/incerteza, aplicação humana, SSE real SDK com fetch simulado, HTTP403/erro em stream/vazio sem retry. Regressões existentes17PASS. Nenhuma prova local obrigatória dependente de/tmp ou Chromium adicionada.

Harness automático reportou build OK após as correções de tipos. Não foi executada bateria main nem CI remoto. O harness não estabelece typecheck Deno separado dos novos adaptadores SDK servidor. Validação externa/provider e fluxo autenticado real permanecem NÃO VERIFICADOS por proibição de chamadas cobradas/Cloudwrites/pilotos nesta tarefa.

## Dependências antes de qualquer disponibilidade
1. Controller confirma CI quality verde do SHA integrado atual antes de novo dispatch não corretivo/Publish. CI401 do HEAD inicial foi confirmado por Pedro; não é CI desta entrega.
2. Verificação específica Deno/SDK/schema e disponibilidade do modelo/configuração existente, apenas por caminho futuramente autorizado. Nenhuma chave criada/solicitada; disponibilidade não inferida.
3. Configuração durável de pausa/negação do provider precisa de revisão antes de mudar `ANALYSIS_PROVIDER_REVIEWED`; esta tarefa não cria tabela/DDL para contornar isso.
4. Validação externa finita e revisão da disponibilização9/aceitação8 separadas. Não ativar apenas porque os testes locais passaram.

## Limpeza e regra de Pedro
Segundo relato controller,81/83 concluídos com financeiro/auditoria/proteções preservados; não repetidos pelo agente. Resíduos Auth/Storage adiados para exclusão manual. Contas reais, histórico, auditorias e origens ambíguas excluídos de qualquer limpeza. Nenhum manifesto/UUID/PII operacional acrescentado aqui.

Proibido ao agente criar contas, fixtures, faturas ou arquivos fictícios no banco ou Storage do ERP. Testes somente locais/isolados. Nesta tarefa: zero chamadas pagas/documentos reais/escritasCloud/deploy/DDL/DML/ativação/Gmail/Drive/OAuth/Publish. #323/DECISIONS e demais frentes preservadas.

## Checklist18etapas (ordem original)
- [x]1–7: concluídas conforme fecho anterior, sem nova certificação nesta tarefa.
- [ ]8: parcial; check iniciado após revogação, HTTP simultâneo mesma prévia e download separado/SHA ainda pendentes, não dispensados.
- [ ]9: disponibilização/publicação inicial restrita não liberada.
- [ ]10: código análise/OpenAI preparado e testes locais aprovados; configuração/validação externa pendentes, não concluída.
- [ ]11: Gmail.
- [ ]12: Drive.
- [ ]13: transações/anexos.
- [ ]14: BP/Formalidade.
- [ ]15: extratos.
- [ ]16: bilheteiras.
- [ ]17: aceitação integrada.
- [ ]18: fecho final.

Próxima ação concreta: controller confirmar CI do SHA integrado e rever os novos arquivos/gates; depois delimitar verificação SDK/configuração, sem liberar9 nem repetir piloto8 implicitamente.