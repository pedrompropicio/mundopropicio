create or replace function crm.audience_validate(p_proposal jsonb)
returns jsonb
language plpgsql stable security definer
set search_path = crm, public
as $$
declare
  v_market text := coalesce(p_proposal->>'market_scope','PT');
  v_currency text := upper(coalesce(p_proposal->>'currency','EUR'));
  v_min_ev int := 5; v_veto_mult numeric := 3.0;
  v_roas_target numeric := nullif(p_proposal->>'roas_target','')::numeric;
  v_janela numeric := nullif(p_proposal->>'janela_dias','')::numeric;
  v_cpa    numeric := nullif(p_proposal->>'cpa_esperado_eur','')::numeric;
  v_n_adsets int; v_struct_p90 numeric; v_struct_max numeric; v_struct_carimbo text;
  v_currency_ok boolean; v_carimbos jsonb := '[]'::jsonb; v_rec record;
  v_n_ok int:=0; v_n_aviso int:=0; v_n_vermelho int:=0;
  v_n_sai int:=0; v_n_tarde int:=0; v_n_naosai int:=0; v_dias numeric; v_apr text;
  v_roas_block jsonb := null; v_roas_med numeric; v_verdict text;
begin
  v_currency_ok := case when v_market='PT' then v_currency='EUR' else true end;

  select round((percentile_cont(0.90) within group (order by k.n))::numeric,0), max(k.n)
    into v_struct_p90, v_struct_max
  from (select m.id, count(e.*) n from crm.campaign_memory m
          join crm.campaign_memory_element e on e.campaign_memory_id=m.id
         where m.market_scope=v_market and m.is_provisional=false group by m.id) k;

  v_n_adsets := jsonb_array_length(coalesce(p_proposal->'adsets','[]'::jsonb));
  v_struct_carimbo := case when v_struct_p90 is null then 'sem_evidencia'
    when v_n_adsets<=v_struct_p90 then 'ok' when v_n_adsets<=v_struct_max then 'aviso' else 'vermelho' end;

  for v_rec in
    with env as (
      select e.audience_archetype arquetipo, count(*) n_evidencia,
             round((percentile_cont(0.90) within group (order by e.daily_budget_cents))::numeric/100.0,0) p90_eur
        from crm.campaign_memory_element e join crm.campaign_memory m on m.id=e.campaign_memory_id
       where m.market_scope=v_market and m.is_provisional=false
         and e.daily_budget_cents is not null and e.daily_budget_cents>0
       group by e.audience_archetype),
    prop as (select a.ord::int idx, a.value->>'archetype' arquetipo,
                    (a.value->>'daily_budget_eur')::numeric orc_eur
               from jsonb_array_elements(coalesce(p_proposal->'adsets','[]'::jsonb)) with ordinality a(value,ord))
    select p.idx,p.arquetipo,p.orc_eur,env.p90_eur,env.n_evidencia,
           round(env.p90_eur*v_veto_mult,0) veto_eur,
           case when env.arquetipo is null then 'sem_evidencia'
                when env.n_evidencia<v_min_ev and p.orc_eur>env.p90_eur then 'aviso'
                when p.orc_eur<=env.p90_eur then 'ok'
                when p.orc_eur<=round(env.p90_eur*v_veto_mult,0) then 'aviso' else 'vermelho' end carimbo
      from prop p left join env on env.arquetipo=p.arquetipo order by p.idx
  loop
    if v_rec.carimbo='ok' then v_n_ok:=v_n_ok+1;
    elsif v_rec.carimbo='vermelho' then v_n_vermelho:=v_n_vermelho+1; else v_n_aviso:=v_n_aviso+1; end if;

    if v_cpa is null or v_janela is null or v_rec.orc_eur is null or v_rec.orc_eur<=0 then
      v_dias:=null; v_apr:='sem_dados';
    else
      v_dias := round(50*v_cpa/v_rec.orc_eur,0);
      v_apr := case when v_dias<=least(7,v_janela) then 'sai_a_tempo'
                    when v_dias<=v_janela then 'sai_tarde' else 'nao_sai_na_janela' end;
      if v_apr='sai_a_tempo' then v_n_sai:=v_n_sai+1;
      elsif v_apr='sai_tarde' then v_n_tarde:=v_n_tarde+1; else v_n_naosai:=v_n_naosai+1; end if;
    end if;

    v_carimbos := v_carimbos || jsonb_build_object('idx',v_rec.idx,'archetype',v_rec.arquetipo,
      'daily_budget_eur',v_rec.orc_eur,'ok_ate',v_rec.p90_eur,'vermelho_acima',v_rec.veto_eur,
      'n_evidencia',v_rec.n_evidencia,'carimbo',v_rec.carimbo,'dias_ate_50',v_dias,'aprendizado',v_apr);
  end loop;

  if v_roas_target is not null then
    select round((percentile_cont(0.5) within group (order by roas))::numeric,2) into v_roas_med
      from crm.campaign_memory where market_scope=v_market and is_provisional=false and roas is not null;
    v_roas_block := jsonb_build_object('valor',v_roas_target,'mediana_historica',v_roas_med,
      'carimbo',case when v_roas_med is not null and v_roas_target>v_roas_med*2 then 'aviso' else 'ok' end);
  end if;

  v_verdict := case
    when v_n_vermelho>0 or v_struct_carimbo='vermelho' or not v_currency_ok then 'exige_destrave'
    when v_n_aviso>0 or v_struct_carimbo='aviso'
         or (v_roas_block is not null and v_roas_block->>'carimbo'='aviso') then 'tem_avisos' else 'ok' end;

  return jsonb_build_object('market',v_market,'verdict',v_verdict,'currency_ok',v_currency_ok,
    'structure',jsonb_build_object('n_adsets',v_n_adsets,'ok_ate',v_struct_p90,'vermelho_acima',v_struct_max,'carimbo',v_struct_carimbo),
    'roas_target',v_roas_block,
    'aprendizado',jsonb_build_object('janela_dias',v_janela,'cpa_esperado_eur',v_cpa,
      'sai_a_tempo',v_n_sai,'sai_tarde',v_n_tarde,'nao_sai',v_n_naosai,
      'nota',case when v_cpa is null or v_janela is null then 'sem janela/CPA - aprendizado nao avaliado'
                  when v_n_naosai=v_n_adsets then 'Learning Limited a janela toda: pesa no quente, verba estavel no dia 1, sem saltos >20%'
                  when v_n_naosai>0 then 'parte dos adsets nao sai na janela - priorize os que saem ou consolide verba'
                  else 'sai do aprendizado dentro da janela' end),
    'adsets',v_carimbos,'resumo',jsonb_build_object('ok',v_n_ok,'aviso',v_n_aviso,'vermelho',v_n_vermelho));
end;
$$;

grant execute on function crm.audience_validate(jsonb) to authenticated, service_role;