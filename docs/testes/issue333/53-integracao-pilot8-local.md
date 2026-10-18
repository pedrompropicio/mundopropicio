# #333 — integração candidata pilot8, entrega local

UTC 2026-10-18T05:57:28.568985+00:00. Base autorizada e50cb4490619f14966c81c41357e405312b44ef2; ancestralidade verificada. Executor único, sem subagentes. Fase6 CONCLUÍDA, fase7 aberta, fase8 não executada.

## Código efetivamente integrado
- data-entry/handler.ts e index.ts nos destinos reais: pilotScoped=true, uploadEnabled=false. SQL ausente/malformado responde status200 upload=false/unavailable=true; efeito503, sem informação privada nem fallback global.
- Auth e empresa/papel canónicos revalidados antes de upload/readback/receipt; receipt service-only, com owner/company/session/path/document e gate transacional. Browser não pode fabricar recibo. Conferência e retoma próprias read-only continuam após revogação.
- SQL PENDENTE fora registry: supabase/manual/20261018_issue333_pilot8_allowlist.PENDENTE.sql. Nenhum SQL histórico alterado. Gate exato owner+empresa+operação; locks perfil/roles/empresa/allowlist; expiração relida depois do lock de identidade antes INSERT. Novos objetos não herdam grants do executor. CREATE OR REPLACE mantém ACL existentes, incluindo grants nominais reais.
- Rollback PENDENTE separado: exige MD5 das sete fontes candidatas e nenhuma allowlist enabled; restaura quatro fontes antigas sem DROP/delete. Receipt/gates remanescentes continuam fechados. Desativação prévia exclusiva das linhas do piloto deve ser coordenada antes do rollback.

## Prova assertiva
17 PG17/pgcrypto PASS, duas conexões e bytes persistidos: owner/tenant/role, gates fechados mesmo globals true local/ROLLBACK, prévia vinculativa, autorização nome servidor, uma fatura EUR0/IVA0, duplo clique1resultado/1audit, zero TX/BP/contas/pagamentos/reembolsos. Expiração durante upload/readback/receipt impede recibo/documento; expiração durante espera advisory real (pg_locks not granted comprovado) impede INSERT/result/audit. Revogação mantém check read-only. Grant nominal e defaults locais simulam ACL herdada: existentes preservados; novos objetos removem grants indiscriminados. Rollback PASS.
46 regressões PG PASS (22hash+24fixture). Vitest geral1406 PASS/1skip/11todo preexistentes; três suites específicas26PASS; tsgo0/Deno0/build isolado0; preview buildOK.
Chromium/React integrado26PASS (Assistente/scanner/editor/reserva/recuperação/Auth/empresa), destinos reais e SQL local. Esta regressão usa configuração local legada uploadEnabled=true, não é prova UI do allowlist nem piloto Cloud; o allowlist foi exercitado pelo handler real/PG17. Captura visual conferida: Assistente concluído com documento e resultado. Egress empresarial bloqueado; sem credenciais Cloud nas execuções gerais/Chromium isoladas.

## Falhas locais e correções, sem inferência Cloud
Cópia inicial omitiu memória; suite geral falhou e passou após copiar dependência. PATH leitor PDF e evidence/Python de Chromium faltavam; corrigidos. Alias/tipos npm:zod@3 adicionados para CI permanente. Teste de espera inicialmente bloqueava conexão de recibo, não commit; corrigido lock em c1, execução c2 e monitor db; passou com espera real assertiva. Fonte Live/classificação hash intactas; causa histórica timeout não estabelecida.

## Fontes, diff, manifesto e CI
SELECT 05:55:53 UTC revalidou cinco fontesMD5/owner/search_path/ACL. Defaults SELECT05:56:12UTC confirmou grants herdados; candidato limpa só objetos novos. Snapshot normalizado preserva prosrc; integration-manifest.json guarda hashes/MD5/privilégios. integration.diff contém diff integrado desde base autorizada; patches e artifact-manifest atualizados.
CI39101163191 completed/success na base e50cb449, confirmado por API. CI do SHA final desta entrega ainda não observada: não afirmar verde. Mensagem de retoma sem identificador disponível nesta interface; autorização registada pelo texto/HEAD recebido.

## Próximo passo finito do controlador
Rever integration.diff, SQL PENDENTE, rollback e manifesto; revalidar MD5/ACL/defaults atuais e CI do SHA final. Só em tarefa autorizada posterior promover bytes SQL exatos ao registry/migration oficial, aplicar com allowlist vazia, verificar ACL/owner/defaults e gates; deploy exclusivo data-entry, sem Publish. Não abrir flags globais. Não preparar conta nesta entrega. Piloto8 só depois aplicação verificada+PDF válido exato antes conta+autorização específica da única fixture e duas linhas allowlist. Concorrência legada normalizada não resolvida globalmente: referência fictícia fresca e nenhum escritor legado concorrente da mesma identidade; scanner/editor/ingest permanecem fechados no gate333. Automações continuam pausadas.

#323/DECISIONS/AGENTS/0194/portal-track preservados. Nenhuma conta, upload Cloud, DDL/DML Cloud, deploy, Publish, ativação, email/Meta/crons ou financeiro real.
