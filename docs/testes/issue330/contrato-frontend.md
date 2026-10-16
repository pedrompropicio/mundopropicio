# #330 — contrato sequencial do frontend (não implementado)

Só depois de revisão/SQL/API/CRM/ativação autorizados. Formulário portal atual não alterado.

## Sequência

1. Membro confirmado autenticado lê `me.profile`; não escrever ao abrir. Dados antigos capturados não pontuam nem são copiados automaticamente. Não simplificar adesão nem remover guarda DOB/parental.
2. Mostrar nascimento, país nascimento, residência e cidade da própria pessoa, não filhos. Campos vazios por defeito; Portugal/Lisboa só sugestões. Lista `profile_countries` com 249 ISO e labels PT. Países diferentes permitidos.
3. Telefone opcional, consentimento WhatsApp separado e inicialmente desmarcado. Enquanto adapter_pending não mostrar checkbox operativo nem aceite fictício: não há persistência válida. Não confundir checkbox de regulamento com marketing.
4. Só botão de confirmação explícita envia `profile_confirm`. Duplo clique bloqueado visualmente; servidor é autoritativo. Só anunciar +50 com `awarded:50`; 0 significa atualização sem novo prémio. Refazer `me` após sucesso.
5. Mostrar conclusão, pontos da regra e elegibilidade separados: void pode deixar points=0 mas reward_claimed=true. Dados apagados podem deixar complete=false mas reward_claimed=true. Nunca anunciar recompensa renovada.

## Pedidos

```json
{"action":"profile_confirm","token":"<sessão privada>","profile_payload":{"confirm":true,"birth_date":"2000-02-29","birth_country":"BR","residence_country":"PT","city":"Lisboa"}}
```

Só `action`, `token`, `profile_payload` no envelope. Perfil só confirm/DOB/países/cidade/phone opcional. Email/member/company/site/event/pontos/consent flags rejeitados. Sessão nunca em logs/URLs de prova.

Clear explícito: `profile_payload:{"op":"clear"}`. Preserva conclusão/recompensa original; não limpa consentimentos ou telefone por efeito secundário. Phone null explícito apaga telefone do membro; omitir mantém.

`profile_preferences` é reservado, confirmado e rate-limited; nesta versão responde 409 `whatsapp_adapter_pending`, sem gravação. Contrato futuro precisa canal/finalidade/version/idempotência/receipt de aceitação e revogação por sessão; não implementado pelo payload atual.

## Respostas

- `me.profile`: campos demográficos e phone PRIVADOS, complete/completed_at/reward_claimed/eligible/available/points/reward_points/version/scope; whatsapp.status adapter_pending/editable false. Não expor em cache público/bundle/ranking.
- `club.profile_mission` público: chave/label/points/cap/scope/version/available/status, sem dados de membros/contagens. Antes de enabled, points=null e indisponível; depois 50, adesao, cap50.
- `profile_confirm`: `{ok:true,awarded:50|0,profile:{...}}`.
- 401 no_session; 400 payload/data/país/cidade/phone/confirm inválidos; 409 parental_flow_required/profile_unavailable/whatsapp_adapter_pending; 429 limite; 503 rate_unavailable; 500 erro de crédito/backend, nunca sucesso falso.

## Tooltip e estados

“50 pontos uma única vez ao confirmares o teu perfil. São os teus dados. Telemóvel e WhatsApp são opcionais e não dão nem retiram pontos. Alterar, apagar ou voltar a preencher não dá uma nova recompensa.” Só apresentar 50 como ativo se API available=true.

Bloqueio parental explica necessidade de fluxo verificável, sem afirmar adesão proibida ou consentimento já concedido. Validação não prova veracidade.

Mobile: tooltip abre por toque/foco, pode fechar, corpo rolável e resumo no cartão; foco e leitura por teclado. Não renderizar cidade/país/nomes como HTML. Tratamento de loading/erro refetch não mantém dados de outro membro/sessão.
## Adenda revisão final — isolamento de falhas (16/10/2026)

Contrato additive compatível com parseProfile: em falha opcional `me.profile=null`, `profile_status="temporarily_unavailable"`, `profile_error="profile_state_unavailable"`. A UI existente que ignora perfil ausente continua válida; nunca fabricar campos ou points=0. Sem confirmação: profile=null/status=not_confirmed. Sessão rejeitada pela RPC: HTTP401/no_session, sem cartão privado na resposta.

Em site/bundle: `club.profile_mission.available=false`, `points=null`, `status="error"`, `error="profile_config_unavailable"`. Config ausente/desativada é indisponivel, não erro; núcleo #327/#328 preservado. Códigos fixos não incluem SQL/PII/token. Leituras opcionais limitadas a1500ms, sem retry; não é deadline nem cancelamento para escrita.

profile_confirm continua 500/409/401 conforme erro, sem ok/awarded falso nem retry automático. Rejeição da promessa produz500/profile_confirm_unavailable. Um timeout de transporte de escrita pode ter resultado desconhecido: reler estado, nunca prometer falha de commit ou desbloquear prémio; unicidade/atomicidade SQL permanecem autoritativas.
