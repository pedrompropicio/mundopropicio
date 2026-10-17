# #332 — cidade/lista
- [x] 0186–0189 aplicadas; CAOP308/278+19+11 sem divergências.
- [x] Coletor estrito e deploy apenas newgang-portal + crm-meta-audience-sync; sem Meta manual.
- [x] Prova Live RPC de perfil/consentimento/descadastro.
- [x] Corro2 autorizado: limpeza SQL exato, zero19tabelas; pontos reais58/5250 preservados.
- [x] Leitura cidades: variantes unidas sem backfill; localidades desconhecidas livres.
- [x] Fecho estado/QUADRO e libertação reservas; #323 preservada.
- [ ] Backfill NÃO autorizado por Pedro; permanece inerte, aguarda autorização separada.

# #333 — Assistente de Entrada de Dados
- [x] Validar patch completo em cópia isolada, corrigir artefactos inertes e entregar gates da próxima fase; integrados31/PG36/handler20/geral1334, tsgo/Deno/build OK; sem Live. Provas10–12.
- [x] Gate inicial: HEAD c37d972053f1585e45e81ff9b70011d2a4f371a6 e ancestralidade 150a4a13; #323 preservada; reserva/pedido recebido no QUADRO.
- [x] Auditar contratos/permissões e entregar plano técnico versionado com matriz de operações e dependências.
- [x] Retoma 17:15: CI verify_jwt, guardas canónicas, validação estrita, handler injetável, UI real, PostgreSQL real 2 ligações.
- [x] Correção 17:25: candidatos preservados, readback, conferência read-only, contexto UI/edições, comparação completa, proposta normalização e regressões locais; aguarda revisão independente.
- [x] Preparação autorizada 17:46: inventário de escritores, política forte proposta, compatibilidade inerte, PostgreSQL36/compat26/handler20/regressões35/geral1334; nenhuma aplicação Live. Provas08/09; aguarda revisão.
- [ ] Aplicar DDL/bucket/deploy após revisão das provas (bloqueio: revisão do Pedro/0).
- [ ] Implementar núcleo upload privado, conversa documental, prévia servidor, autorização e execução tipada idempotente apenas para adapters validados.
- [ ] Ativação bloqueada: retoma/claim global legado com chave incompleta, revisão política forte, StorageACL real e autorização aplicação/índice/DDL/deploy; CI novo SHA aguarda propagação. Trava sessionStorage não prova exatamente-um global.
- [x] Documentar efeitos Live inexistentes e limitações; manter Issue/reserva abertas para verificação.
- [ ] Gmail/Drive/OAuth, conciliação, bilheteiras e demais adapters: bloqueados até validação/configuração próprias; sem Publish.
