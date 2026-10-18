# CRM Newgang — campos do perfil na lista + cidade estimada (18/10/2026)

Migração oficial 0199_newgang_crm_profile_fields (guarda MD5 lista 55fe80bc / summary 3caeb989; ACL e dono copiados para a nova assinatura).

## Regras
- Lista: perfil (club_member_profiles via membro Newgang) primeiro; lead_capture.raw da 1.ª captura só se não há perfil ou o campo está vazio. Novas colunas: birth_country, residence_country, city_source (perfil|formulario), profile_complete, profile_completed_at, estimated_city/region/country. Filtro p_profile_complete.
- Summary: total/today/last7/by_day/by_utm pela 1.ª captura (inalterado); by_city/by_age perfil primeiro. Cidade estimada NÃO entra no summary. Contrato JSON igual.
- Cidade estimada = geo_* da 1.ª captura com valor; nunca sobrescreve a declarada; ecrã mostra "estimada (IP)"; CSV com colunas separadas. Não usar em audiências/exportações Meta/TikTok/Google.

## Diagnóstico geo_*
- Único escritor: portal-track (consent=true → ip_inet + lookupIpGeo → ipinfo, com cache ip_geo_cache).
- 395/419 capturas têm IP, só 3 geo; 392 desses IPs nem existem na cache (nem com país null) → o ipinfo não respondeu com sucesso (erro HTTP/429/timeout 2,5 s/token); o código não guarda erros. Não é problema de cabeçalhos CDN (IP chega bem).
- Correção só no backend ERP: trigger BEFORE INSERT lead_capture_geo_local preenche geo_* pela tabela local DB-IP (ip_city_ranges, 523 mil faixas) quando há IP e geo vazio. Sem chamada externa, fail-soft. Portal não tocado.

## Live por SELECT (14:30 UTC)
pessoas/emails únicos 353 = membros Newgang 353; cidade declarada 140 (perfil 102 + formulário 38); só estimada 1; declarada+estimada 2; sem cidade 212; perfil completo 103.

## Capturas antigas — decisão do Pedro (nada feito)
DB-IP local já casa 384 dos 395 IPs. Opções: A) DB-IP Lite local (grátis, CC BY 4.0 com atribuição, cidade ~aproximada, sem envio externo) — recomendada; B) ipinfo pago (token existente, quota/custo, envia IP a terceiro); C) não preencher.

Testes: src/test/newgang-crm-profile-fields.test.ts (11).
