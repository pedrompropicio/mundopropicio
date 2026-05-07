---
name: Coala Drive sync é read-only
description: Sync Coala lê o XLSX do Google Drive como master imutável; nunca escreve/upload no Drive. Decisões Validar/Ignorar/Editar afetam só o sistema.
type: constraint
---

O ficheiro Coala no Google Drive é a **fonte da verdade** e é **read-only** para o sistema.

- A edge function `sync-coala-from-drive` só pode chamar `drive.files.get?alt=media` (download) ou `files/{id}/export` (Sheets→XLSX). **Proibido** usar `files.update`, `files.create`, multipart upload ou qualquer endpoint que mute o Drive.
- O modal de revisão de diferenças (Validar / Ignorar / Editar) e a tabela `coala_sync_decisions` só alteram dados **no sistema** (BP/transações). Nunca propagam alterações de volta ao XLSX do Drive.
- Direção do sync é fixa: **planilha → sistema**. Mesmo em "Editar", o valor custom é gravado no sistema com `notes`, e o Drive permanece intacto.
- Em conflito com edição manual já existente no sistema, o sync **bloqueia** — nunca tenta resolver escrevendo no Drive.

**Why:** O sócio mantém a planilha como master operacional partilhado fora da app; qualquer escrita do sistema no Drive corromperia essa fonte e quebraria a confiança no fluxo.
