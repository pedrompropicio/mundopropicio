# Consentimento e telefone Newgang — 18/10/2026

HEAD inicial GitHub=Lovable fc94677b1e6fe777686bf080a17122795778e4f4, árvore limpa; reserva registada antes de DML e libertada após entrega. Pedro autorizou ambos os backfills e DDL Live. Sem Publish/deploy/crons/envios/Meta/portal/formulário/club_points.

## SQL e resultados oficiais
1. backfill-preview.sql (inalterado):contacts67,false_to_true62,true_to_false0,changes65. run_sql executou supabase/manual/20261018_newgang_whatsapp_backfill.PENDENTE.sql byte-exato com BEGIN/COMMIT e locks; nome/comentário INERTE preservados como artefacto histórico, já executado nesta autorização. Pós:67perfiltrue,0revogadostrue.
2. phone-preview.sql: antes62to_copy,3eligible_equal,2phone_owned_by_other_contact. Total64telefonesvazios;2não copiáveis devido UNIQUE(company_id,phone_e164), não apenas conflito no próprio contacto.
3. Migração oficial drizzle/migrations/0198_newgang_whatsapp_phone_projection.sql byte-exata com supabase/manual/20261018_newgang_whatsapp_phone_projection.sql. Guardas MD5 Live antes: project03a8a105996a6bf2262ce215878871c2/latestbf708b279b2f86a4505ecf4f8aa9d787/fpd46a26619e6d80f64614cb4432004899. Depois project9aa16a52c85d348abc765113d81bc037;ownerpostgres,SECURITYDEFINER,search_pathpublic/pg_temp,ACL real preservada sem GRANT adicional. Trigger ledger existente + novo AFTER UPDATE OF phone com WHEN OLD.phone IS DISTINCT FROM NEW.phone usam mesma projeção. Lock contacto antes de ler decisão latest. Nunca overwrites preenchido;revoke mantém telefone;unique_violation isolada não perde decisão.
4. run_sql executou supabase/manual/20261018_newgang_whatsapp_phone_backfill.sql byte-exato:copied62.
5. SELECT final replica crm_whatsapp_eligible: consent_whatsapp + última decisão granted + phone_e164 E164 + member.phone=phone_e164 + HMAC do telefone igual ao ledger:67perfil,67true,0revogadostrue,65elegíveis,2missing_contact_phone. Query reutilizável phone-preview.sql classifica todos;helper privado foi recusado por ACL, nenhuma ampliação. HMAC reproduzido em SELECT sem retornar key/phone/fingerprint.
6. Inelegíveis:member_no56 e283,reasonphone_owned_by_other_contact;telefones e emails não publicados;contactos preservados. Não são telefones diferentes já preenchidos (0 destes).
7. Legados atuais Newgang:26,hasha183a469f50bac2c2ed69d76682f5a41 antes/depois telefone iguais;vínculo por membro/siteNewgang e alternativamente captura/email deu26. Não alegamos29históricos intactos:primeira medição de legados neste turno foi depois do backfill consentimento,logo não há baseline anterior que explique os3. Script consentimento só toca contactos com decisão canónica,semdecision não alterados.

## Testes e limitações
26testesSQLPASS incluindo9novos:grant válido/conflito próprio/telefone alterado/revoke/semcontacto/inválido/update membro/idempotência/telefone de outrocontacto. Fingerprint local determinístico stub, não segredoLive. Suite completa1444PASS,1skipped,11todo;178ficheirosPASS/1skipped. Build automáticoOK. Provas /tmp/newgang-phone-full.log;sem fixtures ou consentimentos artificiais Live.
Fluxo Live validado por backfill e SELECT; triggers grant/revoke/update testados localmente, não provocámos decisões reais para teste. Nenhuma alteração frontend requerida.
Commit técnico observado5e00bb696db6e73d0f5d5f222349281d5d77d147;GitHub ainda fc94677b ancestral na consulta14:09UTC,CI desteSHAsemruns. Não alegamos sincronização/CI final;documentação final pode gerar commit posterior automático.

## Pendências
Conflitos56/283 exigem revisão específica fora desta tarefa;preservar é recomendado. Divergência29→26legados não resolvida pela baseline disponível. Sem ação automática adicional.
