import { GRAPH } from './artist-meta.ts';
import { loadTikTokConnection, tiktokHost, tiktokGET } from './tiktok-ads.ts';
import { getGoogleAdsAccessToken, googleAdsPost, type GoogleAdsCtx } from './google-ads.ts';
import { cents,integer,daysForRun,deviceOs,paginate,type Level } from './artist-ads-hourly-core.ts';

type Mode = 'today'|'scheduled'|'backfill';
type Row = Record<string,unknown>;
type Connection = {id:string;company_id:string;artist_id:string;platform:string;selected_ad_account_id:string;selected_ad_account_currency:string;login_customer_id?:string};
type Stats = {status:string;rows_written:number;api_calls:number;reason?:string;last_synced_at?:string};
export async function syncTraffic(admin:any,artistId:string,requestId:string,mode:Mode,now:Date,onlyConnection?:string,onlyDay?:string,onlyDevice=false) {
  const results:Record<string,Stats>={}; const detail:Row[]=[];
  let query=admin.schema('crm').from('ad_platform_connections')
    .select('id,company_id,artist_id,platform,selected_ad_account_id,selected_ad_account_currency,login_customer_id')
    .eq('artist_id',artistId).eq('connection_scope','artist').eq('status','active').not('selected_ad_account_id','is',null).order('id');
  if(onlyConnection) query=query.eq('id',onlyConnection);
  const {data:connections,error}=await query;
  if(error) throw new Error('connections_read_failed');
  for(const platform of ['meta','tiktok','google']) results[platform]={status:'not_connected',rows_written:0,api_calls:0};
  const deadline=Date.now()+105000;
  const check=()=>{if(Date.now()>deadline)throw new Error('work_deadline');};
  for(const conn of (connections??[]) as Connection[]) {
    const stats=results[conn.platform]; if(!stats)continue;
    if(stats.status==='not_connected')stats.status='success';
    let callCount=0, written=0;
    const call=()=>{check();callCount++;};
    try {
      let timezone='',currency=conn.selected_ad_account_currency;
      let metaToken=''; let tikToken=''; let tikHost=''; let google:GoogleAdsCtx|undefined;
      if(conn.platform==='meta'){
        const key=Deno.env.get('ENCRYPTION_MASTER_KEY'); if(!key)throw new Error('encryption_key_missing');
        const {data:t,error:e}=await admin.rpc('crm_get_meta_decrypted_token',{p_connection_id:conn.id,p_master_key:key});
        metaToken=(Array.isArray(t)?t[0]:t)?.access_token??'';if(e||!metaToken)throw new Error('meta_token_unavailable');
        call();const response=await fetch(`${GRAPH}/${conn.selected_ad_account_id}?fields=timezone_name,currency`,{headers:{Authorization:`Bearer ${metaToken}`},signal:AbortSignal.timeout(20000)});
        const data=await response.json();if(!response.ok||data.error)throw new Error('meta_account_metadata_failed');
        timezone=data.timezone_name;currency=data.currency;
      }else if(conn.platform==='tiktok'){
        const key=Deno.env.get('ENCRYPTION_MASTER_KEY');const host=tiktokHost();if(!key||!host)throw new Error('tiktok_config_missing');
        const t=await loadTikTokConnection(admin,{connectionId:conn.id,masterKey:key,exigirToken:true});
        if(!t.ok||!t.accessToken)throw new Error('tiktok_token_unavailable');tikToken=t.accessToken;tikHost=host;
        call();const info=await tiktokGET<any>(host,'advertiser/info/',{advertiser_ids:JSON.stringify([conn.selected_ad_account_id]),fields:JSON.stringify(['currency','timezone','display_timezone'])},tikToken);
        if(!info.ok)throw new Error('tiktok_account_metadata_failed');const data=info.data?.list?.[0];
        timezone=data?.timezone??data?.display_timezone;currency=data?.currency??currency;
      }else{
        const developerToken=Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN');
        const loginCustomerId=(conn.login_customer_id??Deno.env.get('GOOGLE_ADS_LOGIN_CUSTOMER_ID')??'').replace(/-/g,'');
        const customerId=conn.selected_ad_account_id.replace(/-/g,'');
        if(!developerToken||!/^\d+$/.test(loginCustomerId)||!/^\d+$/.test(customerId))throw new Error('google_config_missing');
        call();google={accessToken:await getGoogleAdsAccessToken(),developerToken,loginCustomerId,customerId};
        call();const data=await googleAdsPost<any>(google,`/customers/${customerId}/googleAds:searchStream`,{query:'SELECT customer.time_zone, customer.currency_code FROM customer LIMIT 1'});
        const customer=data?.[0]?.results?.[0]?.customer;timezone=customer?.timeZone;currency=customer?.currencyCode;
      }
      if(typeof timezone!=='string'||!timezone||!currency||!/^[A-Z]{3}$/.test(currency))throw new Error('account_timezone_currency_missing');
      const hourlyDays=onlyDay?[onlyDay]:daysForRun(now,timezone,mode,14);
      const deviceDays=onlyDay?[onlyDay]:daysForRun(now,timezone,mode,30);
      const write=async(rows:Row[],device:boolean)=>{
        for(let offset=0;offset<rows.length;offset+=20){check();
          const {data,error}=await admin.rpc('artist_ads_refresh_write',{p_artist_id:artistId,p_request_id:requestId,p_connection_id:conn.id,p_rows:rows.slice(offset,offset+20),p_device:device});
          if(error)throw new Error(`writer_rejected:${error.code??'unknown'}`);
          if(!data?.accepted)throw new Error('stale_request');written+=data.rows_written;
        }
      };
      const base=(level:Level,campaign:string,adset:string,day:string):Row=>({level,external_campaign_id:campaign,external_adset_id:adset,metric_date:day,account_timezone:timezone,currency});
      for(const level of ['campaign','adset'] as Level[]) {
        if(conn.platform==='meta'){
          for(const device of (onlyDevice?[true]:[false,true])){
            for(const day of device?deviceDays:hourlyDays){
              const breakdown=device?'impression_device':'hourly_stats_aggregated_by_advertiser_time_zone';
              const url=new URL(`${GRAPH}/${conn.selected_ad_account_id}/insights`);
              url.search=new URLSearchParams({level,fields:`campaign_id,${level==='adset'?'adset_id,':''}impressions,clicks,spend,account_currency`,breakdowns:breakdown,time_increment:'1',time_range:JSON.stringify({since:day,until:day}),limit:'500'}).toString();
              const rows=await paginate<any>(url.toString(),async cursor=>{
                const pageUrl=new URL(cursor);if(pageUrl.origin!=='https://graph.facebook.com')throw new Error('meta_pagination_origin');
                call();const response=await fetch(pageUrl,{headers:{Authorization:`Bearer ${metaToken}`},signal:AbortSignal.timeout(20000)});
                const data=await response.json();if(!response.ok||data.error)throw new Error(`meta_report_failed:${data.error?.code??response.status}`);
                if(!Array.isArray(data.data))throw new Error('meta_report_shape');return {rows:data.data,next:data.paging?.next};
              });
              const normalized=rows.map(r=>{
                if(r.date_start!==day)throw new Error('meta_report_date');
                const out:Row={...base(level,String(r.campaign_id??''),level==='adset'?String(r.adset_id??''):'',day),impressions:integer(r.impressions),clicks:integer(r.clicks),spend_cents:cents(r.spend)};
                if(device){const v=String(r.impression_device??'');return {...out,breakdown_value:v,raw:{breakdown_source:'impression_device',device_os:deviceOs(v)}};}
                const hour=String(r[breakdown]??'').match(/^(\d{1,2}):/);if(!hour)throw new Error('meta_report_hour');
                return {...out,metric_hour:Number(hour[1]),raw:{breakdown_source:breakdown}};
              });
              await write(normalized,device);detail.push({platform:'meta',connection_id:conn.id,level,day,kind:device?'device':'hourly',rows:normalized.length});
            }
          }
        }else if(conn.platform==='tiktok'){
          if(onlyDevice)continue;
          let groups=new Map<string,string>();
          if(level==='adset'){
            const list=await paginate<any>('1',async cursor=>{call();const r=await tiktokGET<any>(tikHost,'adgroup/get/',{advertiser_id:conn.selected_ad_account_id,page:cursor,page_size:'1000'},tikToken);if(!r.ok)throw new Error(`tiktok_groups_failed:${r.code}`);const total=Number(r.data.page_info?.total_page);if(!Number.isFinite(total))throw new Error('tiktok_pagination_missing');return {rows:r.data.list??[],next:Number(cursor)<total?String(Number(cursor)+1):undefined};});
            groups=new Map(list.map(r=>[String(r.adgroup_id),String(r.campaign_id)]));
          }
          for(const day of hourlyDays){
            const id=level==='campaign'?'campaign_id':'adgroup_id';
            const rows=await paginate<any>('1',async cursor=>{call();const r=await tiktokGET<any>(tikHost,'report/integrated/get/',{advertiser_id:conn.selected_ad_account_id,report_type:'BASIC',data_level:level==='campaign'?'AUCTION_CAMPAIGN':'AUCTION_ADGROUP',dimensions:JSON.stringify([id,'stat_time_hour']),metrics:JSON.stringify(['spend','impressions','clicks']),start_date:day,end_date:day,page:cursor,page_size:'1000'},tikToken);if(!r.ok)throw new Error(`tiktok_report_failed:${r.code}`);const total=Number(r.data.page_info?.total_page);if(!Number.isFinite(total))throw new Error('tiktok_pagination_missing');return {rows:r.data.list??[],next:Number(cursor)<total?String(Number(cursor)+1):undefined};});
            const normalized=rows.map(r=>{const time=String(r.dimensions?.stat_time_hour??'');const match=time.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2})/);if(!match||match[1]!==day)throw new Error('tiktok_report_date_hour');const external=String(r.dimensions?.[id]??'');const campaign=level==='campaign'?external:groups.get(external);if(!campaign)throw new Error('tiktok_campaign_unresolved');return {...base(level,campaign,level==='adset'?external:'',day),metric_hour:Number(match[2]),impressions:integer(r.metrics?.impressions),clicks:integer(r.metrics?.clicks),spend_cents:cents(r.metrics?.spend),raw:{source_level:level==='campaign'?'AUCTION_CAMPAIGN':'AUCTION_ADGROUP'}};});
            await write(normalized,false);detail.push({platform:'tiktok',connection_id:conn.id,level,day,kind:'hourly',rows:normalized.length,returned_days:[...new Set(rows.map(r=>String(r.dimensions?.stat_time_hour??'').slice(0,10)))]});
          }
        }else if(google){
          if(onlyDevice)continue;
          for(const day of hourlyDays){call();const query=`SELECT campaign.id, ${level==='adset'?'ad_group.id, ':''}segments.date, segments.hour, metrics.cost_micros, metrics.impressions, metrics.clicks FROM ${level==='campaign'?'campaign':'ad_group'} WHERE segments.date = '${day}'`;
            const chunks=await googleAdsPost<any>(google,`/customers/${google.customerId}/googleAds:searchStream`,{query});if(!Array.isArray(chunks)||chunks.some(c=>c.error))throw new Error('google_report_shape');
            const rows=chunks.flatMap(c=>c.results??[]).map(r=>{if(r.segments?.date!==day)throw new Error('google_report_date');const micros=integer(r.metrics?.costMicros);return {...base(level,String(r.campaign?.id??''),level==='adset'?String(r.adGroup?.id??''):'',day),metric_hour:integer(r.segments?.hour),impressions:integer(r.metrics?.impressions),clicks:integer(r.metrics?.clicks),spend_cents:micros===null?null:Math.round(micros/10000),raw:{cost_micros:micros,source_level:level==='campaign'?'campaign':'ad_group'}};});
            await write(rows,false);detail.push({platform:'google',connection_id:conn.id,level,day,kind:'hourly',rows:rows.length});
          }
        }
      }
    }catch(e){
      stats.status=written>0?'partial':'error';
      const message=e instanceof Error?e.message:'sync_failed';
      stats.reason=/^[a-z_]+(?::[a-zA-Z0-9_-]+)?$/.test(message)?message:'platform_request_failed';
      detail.push({platform:conn.platform,connection_id:conn.id,error:stats.reason});
      stats.api_calls+=callCount;stats.rows_written+=written;
      for(const later of Object.values(results))if(later.status==='not_connected'){later.status='error';later.reason='stopped_after_error';}
      return {results,detail};
    }
    stats.api_calls+=callCount;stats.rows_written+=written;
  }
  for(const stats of Object.values(results))if(stats.status==='success')stats.last_synced_at=new Date().toISOString();
  return {results,detail};
}