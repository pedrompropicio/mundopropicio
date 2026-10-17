# ESTADO — newgang-portal

Atualizado: 17/10/2026 14:53 UTC. Frente: newgangfestival.pt.

## Em que pé está
#332 cidade/lista Fase B aplicada, verificada e documentalmente fechada; reservas libertadas. Backfill NÃO executado: Pedro autorizou exclusivamente Corro 2 (limpeza), recusando autorização ao Corro 1 nesta sessão. Nenhuma alteração a portal-track, cron, configuração da lista, Meta manual ou Publish.

### Aplicação 0186–0189
- 0186: contrato inicial de cidade aplicado; continha erro que dispensava país e cinco nomes CAOP incorretos. Substituído/corrigido pelas seguintes, não usar as notas antigas como estado atual.
- 0187: país de residência obrigatório, PT exige concelho; corrigidos cinco nomes, mas foram identificadas três transcrições erradas adicionais.
- 0188: reparação definitiva 0208/1606/1607. Texto original/enviado 1471 bytes, SHA256 `59a3f900c48c53fec17cd223043146f425c382e02c5a2e61bc54b16663129d2f`, iguais byte a byte. A ferramenta acrescentou apenas 1 LF final ao ficheiro gerado (1472 bytes). Guarda da definição Live e assinatura de 308 pares preservadas. SELECT: 308 = 278 Continente + 19 Açores + 11 Madeira; assinatura `c2173f4ab7f8f5a55e60b40cd24e414e`, igual à fixture CAOP; zero divergências. 0204 Barrancos; 0208 Ferreira do Alentejo; 0405 Macedo de Cavaleiros; 0406 Miranda do Douro; 0407 Mirandela; 0408 Mogadouro; 1606 Ponte da Barca; 1607 Ponte de Lima.
- 0189: coletor estrito aplicado (SQL original + apenas LF da ferramenta). Ramo newgang_clube:v2, anuncios-v1 meta_ads efetivo atual, membro/site MP Newgang, >=13, email válido não suprimido, phone=NULL e entrega emailhash-only. Legados nunca concedem anúncios.
- Deploys efetuados apenas newgang-portal (SHA256 fonte `2fd2c38f4004cef6195d6205f68c4f5fe6cdb6c44ec580e86d1e190260f7a610`) e crm-meta-audience-sync (`507507a15887d4865d49eb6a3ec0a5167920c576271c4d26d49276dcee377554`).
- Gate anterior à aplicação: remoto `472fdccdc2cb5dec36be51ed66f8a6d32f6aed4e`, CI/quality success de `b6a37939d22d666d567ff159ea59f3e19ddcfb7f`, 1439 ficheiros iguais e diff aplicável vazio. Bloqueios das sessões anteriores superados pela autorização A de Pedro.
- P_NG27_LISTA: enabled=true, source=newgang_clube:v2, replace=true; cron2499 ativo `35 4 * * *` (04:35 UTC), intocado. Nota antiga enabled=false está incorreta; não há sync Meta manual.

### Prova Live e limpeza
- Prova RPC com inscrição de teste pela entrada normal: country_invalid/city_unknown/city_invalid; PT válido; BR sem cidade; 50 pontos primeira confirmação e 0 na repetição; legado excluído, grant incluído email-only, revoke/descadastro excluídos. PASSOU. Tentativa inicial numa única transação foi revertida; pedidos separados passaram. Interface do portal separado não verificada.
- Pedro autorizou exclusivamente Corro 2 às14:51 UTC. SQL exato do bloco de docs/questoes-332-aplicacao-dois-corro-20261017.md: 2080 bytes, SHA256 `ddb02e1ae9d59f42f26c14247c65c2e01015ab406a3f89f706f2321097c55ee1`. Aplicado; SELECT zero em todas as19 tabelas tocadas, incluindo membro/contacto/email/tokens/captura e sujeitos do teste.
- Origem: SELECT Live antes/depois desta limpeza. Membros deste site 64→63 (63 reais antes e depois), NÃO63→62 esperado pelo Pedro; nenhuma pessoa real removida para forçar esse número. Pontos reais antes/depois iguais: friend_joined9/750; join_confirmed41/4100; profile_complete8/400; total58 linhas/5250 pontos.
- Output: claude-outputs/20261017-1453-issue332-limpeza-leituras.md. Sem novas suites.

### Cidades hoje (somente leitura)
- Gráfico CRM lê clube_newgang_summary; tabela/CSV lê clube_newgang_list. Ambos usam club_city_display. Captura sem residence_country recebe fallback PT apenas para apresentação; não grava nem infere país no cadastro.
- Summary agrupa por club_city_key (sem maiúsculas/acentos/espaços). lisboa/Lisboa → Lisboa20; Santarem/Santarém → Santarém2. Exato oficial é apresentado canónico; localidades/erros sem correspondência ficam livres, nunca aproximados a concelhos.
- Consulta equivalente à definição Live (a invocação direta do RPC pela ferramenta read-only foi recusada por permissões): sem cidade40; Lisboa20; Seixal3; Almada/Santarém/Sintra2 cada; Barreiro/Caacais/cacem são marcos/Cascais/Castelo Branco/fazendas de almeirim/Lavradio/Montijo/Porto/Queluz/São Paulo/Sesimbra/Tomae/Torres Novas1 cada. Todas83 capturas sem país de residência.
- Top10 do gráfico termina em Cascais; Castelo Branco e fazendas de almeirim estão fora do top10 por ordenação, não excluídos. cacem são marcos e fazendas de almeirim não são convertidos em Sintra/Almeirim. Backfill não necessário para unir diferenças de caixa/acento no resumo e não autorizado para alterar histórico.

## Contrato final para o site
Perfil exige birth_date, birth_country e residence_country válidos. País ausente/inválido: country_invalid. PT exige concelho oficial válido (vazio: city_invalid; desconhecido: city_unknown). Fora PT cidade opcional, livre/vazia. lead_capture não infere país; valida concelho só com PT explícito. Parental <13 preservado. portal-track intocado.

## Outras frentes preservadas
- #327 configuração2027-v1: inscrição100, indicação75/cap750, Crew100; níveis0/750/3000; compras indisponíveis, direitos adquiridos preservados.
- #328 identidade/concorrência/pendência Crew aplicadas.
- #330 profile-v1, 50 únicos por adesão/site com confirmação explícita; menores13 parental_flow_required.
- #332 email/ads0182–0183, imediato0184, WhatsApp0185 aplicados. WhatsApp append-only/HMAC por número; grant exige número, revoke não; alteração invalida autorização. Texto jurídico/adapter/portal separado ainda pendentes.
- #323 preservada, sem tocar reserva ou trabalho financeiro.

## A trabalhar agora
Nenhuma reserva cidade/lista. Esta frente encerrada; backfill continua inerte por falta de autorização.

## Próximos passos independentes
Portal separado: caixas WhatsApp/email e pending; Publish por Pedro. Fluxo parental verificável, PDF primeira conclusão, link Fever, primeira revelação, fotos/aftermovies, benefícios e validação jurídica WhatsApp permanecem nas frentes anteriores. Early entry suspenso até validação MEO Arena. TikTok/Google/pixels fora desta etapa.

## Factos e referências
Portal separado chama newgang-portal e portal-track; configuração no CRM. Cache CRM60s; revelações expiram em public_at; trackers vêm do CRM. Wallet cor por objeto não suportada, sem classes alternativas autorizadas. Artes aprovadas; visual no dispositivo pendente.
.lovable/memory/features/portal-newgangfestival.md; docs/specs/portal-newgangfestival.md; docs/testes/issue327/, issue328/, issue330/, issue332/; docs/questoes-332-fecho-limpeza-20261017.md.
