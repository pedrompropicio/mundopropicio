# #333 fase12c — anexo/corpo → scanner → candidato Ticketline → revisão server-bound (LOCAL, FECHADO)

Base: HEAD local = main 252c6665b99879a811c9ef0a67c9f97f08a324b3; CI run39424076047 SUCCESS (controller).

## Concluído (código + testes locais)
- `_shared/assistant-ticketline-candidate.ts`: candidato tipado com proveniência por campo/linha
  (email_body: message_id + sha256 do corpo + linha + truncado; attachment: gmail:msg:part + sha256 + tamanho + mime; human: user da sessão).
  Parser determinístico do corpo (sem instruções, tipos desconhecidos → pendência), limites 4000 chars/40 linhas/20 MB.
- Anexo: só da mensagem escolhida, hash calculado no servidor e comparado com o esperado; scanner EXISTENTE
  (`scanAttachment`, controlo durável) só com análise ativa — hoje fechado: anexo verificado, campos por confirmar.
  Conflito anexo×corpo esvazia o campo e cria pendência; valor igual mantém a 1.ª origem.
- Revisão humana: número, data, total, evento e linhas; qualquer edição muda proveniência e hash (autorização antiga inválida).
- Recebimento: só pedido humano autenticado com confirmação explícita; conta lida com JWT do chamador, da empresa canónica e ativa;
  data não futura. Entra no hash; liquidação (a5) continua bloqueada.
- Handler: `ticketline_candidate` (candidato HMAC assinado por user+empresa, 30 min), `ticketline_preview` (prévia no servidor,
  `persisted:false`), `save`/`ticketline_authorize` → 503 sem persistência revista (sem memória).
- UI `TicketlineReviewPanel` sob a proposta do assistente; mobile em coluna única. Visual não verificado (assistente fechado).
- SQL INERTE `supabase/manual/20261020_issue333_assistant_review.{INERTE,ROLLBACK-INERTE,readback.SELECT}.sql`:
  revisões versionadas imutáveis, uma autorização por versão, replay idempotente por (owner,empresa,replay_key),
  gate próprio false, RPC SECURITY DEFINER com identidade/empresa no SQL, admin/manager, sem grants diretos.
  Extensão necessária: `data_entry_previews` exige sessão/documento/destino de faturas avulsas; a prévia Ticketline não tem destino nem documento único.

## Provas
- Vitest novos: 11 (candidato, anexo/hash, conflito, edição→hash, recebimento, store 503, handler origem/tenant/adulteração, UI).
- PostgreSQL 17 descartável: `docs/testes/issue333/pg/assistant-review12c.sh` → saída `pg/assistant-review12c.out.txt`
  (gate fechado, ACL, viewer, outra empresa, versão antiga, subconjunto/duplicadas, exata, replay igual/conflito,
  concorrência 2 ligações → uma stale, rollback recusa com linhas, rollback limpo = esquema/ACL inicial, reaplicação/guarda).

## Pendente / bloqueado
1. Executor financeiro inexistente (autorização fica `authorized_inert`); a5 sempre bloqueada ⇒ autorização hoje impossível por desenho.
2. Conferência do recebimento com o saldo canónico do fecho por implementar.
3. Scanner sobre anexo e leitor ERP (`ticketlineErp`) não ligados no index (fechado).
4. Seleção de conta na UI é campo de ID (sem lista); seleção de anexo na revisão não exposta (partId opcional).
5. Modelo real, Gmail real e visual mobile não validados.

## Pacote final de ativação (único, revisável)
1. Rever SQL INERTE; "Sim" do Pedro → aplicar em bloco único (lock_timeout 5s) + readback.
2. Ligar `rpcReviewStore`, `ticketlineErp` (JWT) e `scanAttachment` no index; gates continuam false.
3. Deploy só data-entry após CI verde; janela restrita; uma chamada real autorizada do modelo/scanner.
4. Último passo humano: Pedro revê um fecho real em /transacoes → Assistente; fechar gates/janela no fim.
