# Chegadas horárias — acelerar a comparação de tráfego

## Estado e limites
Plano para aprovação antes de aplicar. Nenhuma migração, captura de teste, backfill ou cron desta tarefa executado. Sem Publish, sem apagar chegadas reais e sem alterar os coletores de anúncios ou permissões sandbox existentes.

A comparação atual conta **chegadas, não visitantes únicos**: não usa `distinct ip_hash`. Os quatro blocos de chegadas podem, portanto, usar somas horárias sem perder essa contagem. Inventário: 238.319 arrivals, primeiro em 25/09/2026; nenhuma sem artista/empresa. Medição inicial de 30 dias no banco: 0,583 s, a repetir na prova antes/depois.

## Entrega
1. Guardar as chegadas por artista, hora UTC, canal efetivo, país e sistema operativo, incluindo o canal `teste`. País ausente fica `?`; Android/iOS/outro seguem o mapa atual. Nenhum IP ou identificador de visitante no agregado.
2. Manter as contagens em INSERT, DELETE e UPDATE relevante. A captura original tem prioridade: uma falha no agregado é registada e não impede guardar o evento.
3. Reconciliar às **04:20 UTC, uma vez por dia**: últimas 72 horas, incluindo a hora parcial, e horas sinalizadas com falhas. Registar dimensões divergentes antes da correção. Mudanças do canal de links são refletidas nesta reconciliação para a janela pedida.
4. Preencher o histórico em blocos pequenos e retomáveis, sem bloquear a tabela de origem durante todo o trabalho. Conferir `sum(n) = count(arrivals)` por artista, incluindo teste.
5. Alterar apenas a leitura de chegadas na `artist_ads_compare`: série, hoje/ontem, dispositivos, LPV e lacunas. Preservar assinatura, autorização, moedas separadas, corte no último sync, rácios, JSON e restantes fontes.

## Segurança e manutenção — detalhes técnicos
- Canal oficial de migrações, com `lock_timeout = '5s'` e guardas de existência/ACL. Criar `public.song_link_arrivals_hourly` com as colunas pedidas, PK `(artist_id, hour_utc, canal, country, os)` e índice `(artist_id, hour_utc)`. `n bigint` não negativo; `hour_utc` normalizada explicitamente em UTC; `updated_at timestamptz`.
- GRANT exclusivo ao `service_role`, RLS ligada, zero policies para authenticated. Revogar acesso direto público/anon/authenticated e sandbox **só aos objetos novos**; verificar permissões efetivas por herança. Leituras através da comparação SECURITY DEFINER com `artist_access_check` mantida.
- Criar log privado para erros e reconciliações: hora/dimensão afetada, código SQL do erro, contagem de divergências e timestamps; sem payload, tokens ou dados de visitantes. Mesmas restrições de acesso. Funções auxiliares/reconciliação sem EXECUTE público; execução de manutenção reservada ao serviço/owner.
- Trigger AFTER INSERT/UPDATE/DELETE, só com trabalho quando OLD/NEW for arrival. UPDATE considera também artista/empresa, além de event, created_at, country, os, utm_* e link_id. Resolver canal pelo link e `song_link_event_canal` canónico; não copiar um mapa paralelo.
- Se OLD/NEW tiverem a mesma dimensão, não escrever. Caso contrário, decremento antigo e incremento novo atómicos no mesmo sub-bloco; ordem de locks determinística. Zero permanece zero, sem contagens negativas; dimensão antiga ausente gera sinalização de reparação, nunca uma contagem inventada.
- Coordenar trigger, backfill e reconciliação por artista/hora. A captura não espera pela manutenção: tentar lock sem espera, sinalizar a hora e seguir se ocupada. Upserts com timeout local curto; restaurar a configuração depois. EXCEPTION regista erro; se o próprio log falhar, emitir WARNING sem falhar a captura.
- Backfill/reconciliação obtêm locks por blocos e recalculam a origem num snapshot novo depois do lock. Substituir apenas agregado das horas do bloco. Não fazer `TRUNCATE` nem DELETE da origem. Reparar horas sinalizadas durante concorrência antes da verificação final; repetir a conferência se houver novas capturas no intervalo.
- A garantia é: manutenção normal transacional; falhas/concorrência sinalizadas são reparadas. O requisito de captura nunca falhar implica que, numa falha do agregado, pode existir uma divergência temporária. Não prometer consistência instantânea durante falhas nem latência adicional literalmente zero.
- Cron SQL diário único, instalado separadamente da migração. Verificar execução, log e horário. Sem varreduras frequentes nem chamadas Meta/TikTok nesta manutenção.
- Conversão da comparação continua `hour_utc` → `p_tz`; documentar precisão para fusos de hora inteira. Manter chegadas sem moeda fora dos totais, com lacuna explícita.

## Provas e critérios de aceitação
- Antes de alterar a função, guardar respostas reais com JWT do Pedro/Litto para 18–21/10 e 30 dias. Comparar todos os campos de chegadas, por chave estável, nos quatro blocos e totais. Executar antes/depois com a mesma referência temporal e dados; timestamps/cortes móveis ficam fora da igualdade ou são apresentados como diferenças justificadas, nunca escondidos.
- Testes locais sem credenciais: INSERT +1, DELETE −1, UPDATE entre dimensões/eventos, normalização UTC/país/OS, canal teste, rollback parcial, falha sem impedir captura, concorrência com reparação e proteção de acesso.
- Verificação histórica por artista e dimensão; `sum(n)` igual à origem. Reconciliação manual final: **0 divergências** após estabilização das horas sinalizadas.
- Uma captura isolada pelo caminho normal `song-link-event`, link real e `utm_source=teste...`, modo de teste, sem códigos que habilitem entrega. Confirmar política de supressão antes da chamada, +1 no agregado e ausência de entrega Meta/TikTok; apagar só esse evento, confirmar −1. Não apagar recibos/artifacts de auditoria nem criar fixtures ERP.
- Medir várias chamadas de 30 dias com JWT Pedro: tempo no banco e pela rede separados; alvo **< 0,5 s no banco**. Se não atingir, otimizar apenas esta leitura e repetir; reportar valores observados sem garantir tempo de rede.
- Guardar outputs completos, comparação e nota final de decisões; atualizar roadmap e regra estrutural em AGENTS.md na implementação.

## Questões/decisões em aberto
Nenhuma decisão de negócio nova. Falhas temporárias são reconciliadas conforme o requisito de não interromper a captura. A aplicação aguarda aprovação deste plano.
