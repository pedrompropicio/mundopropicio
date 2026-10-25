DO $patch$
DECLARE d text:=pg_get_functiondef('public.artist_ads_compare(uuid,date,date,text,text)'::regprocedure);
 a text:=$a$'custo_por_chegada',CASE WHEN nm>0 THEN round(gd/nm,4) END)$a$;
 b text:=$b$'custo_por_chegada',CASE WHEN n>0 THEN round(gd/n,4) END)$b$;
 n1 text:=$n$'custo_por_chegada do trafego_diario = gasto das campanhas com destino ao smart link ÷ chegadas atribuídas a essas campanhas; visualizações/alcance e gasto sem destino ficam em gasto_sem_destino'$n$;
 n2 text:=$n$'custo_por_chegada do trafego_diario = gasto das campanhas com destino ao smart link ÷ chegadas pagas da plataforma (toda a chegada ao smart link prova que a campanha de origem leva ao smart link); visualizações/alcance ficam em gasto_sem_destino; chegadas_sem_campanha = chegadas cuja campanha específica não foi identificada'$n$;
BEGIN
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 OR (length(d)-length(replace(d,n1,'')))/length(n1)<>1 THEN RAISE EXCEPTION 'compare_custo_contract_drift'; END IF;
 EXECUTE replace(replace(d,a,b),n1,n2);
END $patch$;