# #321 continuação — dois casos Clube Newgang (sem dados pessoais)

Autorização: Pedro, 16/10/2026 — processar só as lead_capture `3a46b0df-1fba-42ef-81d6-a4fec0360968` e `93520de1-6121-4988-8ba2-8f1522a936de` (clube_newgang, MP) e o email normal de confirmação do Clube. CI da 1.ª entrega confirmada pelo Pedro: https://github.com/pedrompropicio/mundopropicio/actions/runs/38828429496 (completed/success, SHA 80dd1b422d6481b6068fa6c1ed765c6b06cbf7ae).

## Revalidação antes (00:20 UTC)
- Ambas: processed=false, email presente, company MP, quarentena #321.
- Contactos MP com o mesmo email: 1 cada (o mesmo contacto); membros do Clube: 0; leads ligados: 0; site Newgang activo: 1.
- `notifyPending` só envia a membro `formulario` por confirmar e salta se já houver `email_send_log` `newgang_club_welcome` para o membro → sem reenvio.
- A skill `resolve-recipients` não existe no catálogo; âncora usada = os 2 IDs acima.

## Via
Migração `0167_issue321_crm_ingest_clube_by_ids`: `crm_ingest_clube_captures_by_ids(p_ids)` — só service_role, 1..10 IDs explícitos, só clube_newgang/MP/processed=false; contacto existente só recebe nome vazio e last_activity_at; lead `blocked_no_consent`; marca processed=true → fluxo normal `trg_club_from_lead_capture`. O consumidor contínuo (0166) continua a pôr novas capturas do Clube em quarentena.
Teste sintético revertido (replica, sem trigger/rede): IDs vazios recusados; fora de âmbito não processado; consentimento/origem intactos; lead bloqueado; rerun idempotente; net 0→0.

## Execução (00:21:05 UTC, uma vez)
```
3a46b0df… processed  contact 66e2d7b9…  lead 2441f460…
93520de1… processed  contact 66e2d7b9…  lead d1a9ee97…
```
- As duas capturas são da MESMA pessoa (1 email distinto) → 1 contacto, 1 membro (35ed55a6…, formulario, por confirmar, ligado ao contacto).
- net._http_response desde 00:20:30: 3 respostas HTTP 200 (207901, 207902, 207903); a tabela não guarda o URL, por isso não se atribui cada uma.
- email_send_log: 1 linha `newgang_club_welcome` status `sent` 00:21:06 → aceite pelo envio; entrega na caixa não comprovada. Segunda chamada não gerou 2.º email (dedupe por membro).

## Depois
CAPI suspended=true · jobs 33/34/44/45=0 · leads elegíveis CAPI=0 · pendentes clube_newgang=0. Sem Meta/Google/WhatsApp/push.
