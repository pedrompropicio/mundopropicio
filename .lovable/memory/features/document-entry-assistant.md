---
name: Assistente de Entrada de Dados
description: Gates fechados, autorização explícita de reserva preparada e aceitação local parcial
type: feature
---

## Etapa 2 (17/10/2026 21:40 UTC)
Código integrado e 3 funções implantadas; gates fechados. Clientes ainda legacy mantêm legacy_untracked com contexto canónico válido; tentativa reservada ou incerta nunca recorre ao writer antigo. Nova intenção só para tentativa concluída e mais recente da mesma família (empresa/owner/operação/hash/intent_seq), por confirmação explícita; servidor é autoridade final. Resposta perdida exige conferência read-only e bloqueia repetição, mesmo após mudar seleção. Revisão da UI e aceitação ponta-a-ponta pendentes; certificação negativa não é aceitação completa. Ativação/Publish não autorizados.

Leitura de capacidades é exclusivamente service-only, após Auth e contexto canónico no endpoint; ausência/erro/malformado mantém false. Ler capacidades nunca autoriza mutação nem abre preparação/execução. Settings e gates internos continuam sem acesso externo; aplicar o leitor não autoriza flags true, piloto ou Publish.

## Testes autenticados Live (17/10/2026 23:20 UTC)
Matriz 37/37 PASS com 4 contas fictícias .invalid (banidas no fim) e 1 sessão técnica: capabilities false/false, headers forjados 409, anon 401, RPCs/gates 42501, leitura owner read-only OK, isolamento owner/empresa/papel confirmado, storage sem visibilidade (RLS oculta objetos). Certificação negativa não é aceitação ponta-a-ponta: concorrência/retoma/execução positiva exigem proposta separada. Ativação/Publish não autorizados.

## Limite de aceitação e reserva preparada
Ensaios locais autorizados não abrem operações Live. Reserva preparada só executa com ação explícita do owner/contexto canónico e bytes originais verificados; nova intenção ou seleção não autorizam efeitos. Resultado incerto exige conferência read-only, nunca writer legado. Integração DOM não é Chromium React completo; relatório parcial ou CI geral verde não aprovam aceitação integral.
