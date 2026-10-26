# #352 — mixed_proof_ddl_extraction e G1
Data: 2026-10-26 (UTC). Parecer: [6418537444](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6418537444).

## Resultado
G1 vermelho: 1380 entradas concluídas de 1472; 1 tentativa falhada e 91 não tentadas. Checkpoints: categorias 114/114, cidades 47/47, ambos sem diferenças. G2 não executado nem autorizado nesta etapa.

- [Commit privado](https://github.com/pedrompropicio/mundopropicio-replay/commit/0b4d82a23affb0ed49b8949b0f829082569c1e61).
- [Run G1 desde vazio](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40341387520), entre 14:38:16 e 14:45:40 UTC.
- Artefacto 12658974751, SHA-256 do ZIP: `061027deb0b0ba8c98ff1d742eea0e87442f3b8f4bf64d9a72b872c1170ca98f`.

## Drizzle 0081: passou
A extracção remove apenas as chamadas de prova, comparação MD5 e respectivos RAISE. Os quatro passos DDL mantêm texto e ordem; REVOKE/GRANT posteriores mantêm-se intactos. Provas por SELECT: versão aplicada em Live e funções STABLE; nenhuma função de produção invocada.

Intervalos do original: chamadas L5/L91, comparação e RAISE L92, aviso de prova em L93; preservado o fecho do bloco. DDL: L3, L4, L6 e L7–90. Cauda de privilégios L94–96 intacta. Manifesto privado: `proofs/mixed-proof-ddl.json`; evidência Live: `proofs/mixed-proof-ddl-live.json`.

- Original integral: `d4624be6b1631ea76f2d82e3b92c0ee96edca424644523ecc6344fe3555a2668`.
- Bloco original: `49f54b64b39f8beade2d50a1df94139238361266a51e55cad0fdb60d188242ea`.
- Bloco extraído: `12db2083571a62aa675d9fe746f60029983e5078659171e444087a59c290ce2e`.
- Ficheiro executado: `eba149fb8b3f308834eddb47b0be3fe8491c1ff559b9445ceda79411a4d308f3`.
- Plano: `a8a7b13310baa72fbc8e0269f5cdf7b36336822b0d5aacb0a07d21a7ff9119a9`.

Sete testes locais passaram. Três testes nativos passaram: STABLE e IMMUTABLE aceites, VOLATILE rejeitado antes da execução. Checkpoint real: assinatura antiga ausente, nova presente e definição da função auxiliar exactamente igual à definição anterior. A equivalência MD5 sobre dados de produção não foi testada; é a perda explícita desta extracção.

PII antes da publicação privada: 1258 ficheiros SQL, zero ocorrências, 916 literais JSON válidos; 14:34:53 UTC. #329 confirmado antes do push privado às 14:37:42 UTC: GitHub=Lovable=355e33344e48963f02c7d21873416db2ff794c9a, agente livre.

## Saltos do replay
156 destrutivos; 2137 idempotentes: 1162 base, 611 policy_equal, 175 using_index, 169 trigger_equal, 12 txn_control, 4 grant_revoke_missing_object, 3 insert_duplicate_superseded_by_ledger, 1 insert_duplicate_equal. Outros 9 revistos: 7 data_volume_assertion, 1 orphan_dml_without_effect e 1 platform_role_grant_excluded. Detalhes no artefacto privado em `ledger/skipped-*.json`.

## Novo bloqueio: Drizzle 0150
Id 151, `0150_coala_eb_invite_b_confirmar_lista.sql`, L62, CREATE TRIGGER: SQLSTATE 42883, falta `public.tg_coala_lead_confirm()`. A versão foi revertida. Hash original/executado: `c97ec6d4bc5929e304a0569fa958a334b87358dc78489ea84839be1c65fad70e`.

Investigação por SELECT e leitura das fontes: a função existe em Live, oid 187656, sem CREATE encontrado nas fontes do replay. Candidata à regra live_only_ddl_reconstructed; vizinhos com origem conhecida delimitam a janela entre a criação de get_sales_position_by_provider em 20260827235031 e get_event_bp_changes em 20260828132648. A janela ainda não foi materializada num ficheiro reconstruído.

Conflito antes da publicação: pg_get_functiondef contém um email técnico literal na L9. A verificação local PII detectou exactamente essa ocorrência; nenhuma definição foi publicada. A regra de funções exige texto intacto, enquanto a política de PII exige redigir também remetentes técnicos. Hash da definição original: `2f121de1b0acafcbe20fbbcace7351331ca2ccaebf6245290627b3c90f5d60ab`.

Devolução ao revisor: confirmar se a cópia reconstruída pode redigir exclusivamente esse literal técnico, conservando hashes original/publicado e comparação que explicite a redacção. Não se dispensou o scanner nem se alterou a definição sem essa resolução. A volatilidade da função de trigger não é o bloqueio: a restrição STABLE/IMMUTABLE aplica-se às chamadas retiradas da prova, não à criação desta função.

## Limites e coordenação
Live apenas SELECT; nenhuma escrita, deploy, Publish ou infraestrutura criada. G2 não corrido. Reserva #352 mantida até fecho do gate; QUADRO e estado ficam para Claude Code. Este fecho parcial publica apenas este ficheiro novo e comentário na #352; #329 reconfirmado imediatamente antes do push documental.
