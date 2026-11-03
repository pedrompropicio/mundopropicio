// #486 D23. Three phases, immutable archived bytes, caller-JWT import, service-only attestation.
// Existing platform parsers are retained verbatim. No mirror-based financial import or name inference.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { extractPdfLines, parseMetaInvoiceLines } from '../_shared/ads-invoice-parser.ts';
import { parseGoogleInvoiceLines } from '../_shared/ads-invoice-google-parser.ts';
import { parseTiktokInvoiceLines } from '../_shared/ads-invoice-tiktok-parser.ts';
import { fetchAllPagedQuery } from '../_shared/paging.ts';
import { AdsContractError, decimalFromDatabase, httpStatus, requireThat, uuid } from '../_shared/ads-invoice-generation.ts';
import { extractSourceCurrency, extractSourceIdentity, importAndAttest, resolveSourceIdentity, type AdsPlatform, type SourceHeader, type SourceLine } from '../_shared/ads-invoice-source.ts';
const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json = (value: unknown,status=200) => new Response(JSON.stringify(value),{status,headers:{...cors,'Content-Type':'application/json'}});
const url = Deno.env.get('SUPABASE_URL')!;
const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
const admin = createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null,{headers:cors});
  if (req.method !== 'POST') return json({error:'method_not_allowed'},405);
  try {
    const authorization = req.headers.get('Authorization'); requireThat(authorization,'unauthenticated');
    const caller = createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
    const {data:auth,error:ae} = await caller.auth.getUser(); requireThat(!ae && auth.user,'unauthenticated');
    const body = await req.json(); requireThat(Object.keys(body).every(k => ['action','company_id','file_base64','file_path','dry_run'].includes(k)));
    const platform = ({parse_meta:'meta',parse_google:'google',parse_tiktok:'tiktok'} as Record<string,AdsPlatform>)[body.action];
    requireThat(platform,'invalid_plan'); const companyId = uuid(body.company_id);
    const {data:active,error:ce} = await caller.rpc('current_company_id'); requireThat(!ce && active === companyId,'forbidden');
    requireThat((typeof body.file_base64 === 'string') !== (typeof body.file_path === 'string'));
    let bytes: Uint8Array;
    if (body.file_base64) { requireThat(body.file_base64.length <= 28*1024*1024); bytes=Uint8Array.from(atob(body.file_base64),c=>c.charCodeAt(0)); }
    else {
      requireThat(body.file_path.startsWith(`${companyId}/`) && !body.file_path.includes('..'),'forbidden');
      const {data,error} = await caller.storage.from('ads-invoices').download(body.file_path); if(error || !data) throw new AdsContractError('source_attestation_invalid');
      bytes=new Uint8Array(await data.arrayBuffer());
    }
    requireThat(bytes.length <= 20*1024*1024 && new TextDecoder().decode(bytes.slice(0,5)) === '%PDF-','source_attestation_invalid');
    const tokens = await extractPdfLines(bytes);
    const parsed = platform === 'meta' ? parseMetaInvoiceLines(tokens) : platform === 'google' ? parseGoogleInvoiceLines(tokens) : parseTiktokInvoiceLines(tokens);
    const h = parsed.header; requireThat(h.invoiceNumber && h.billingPeriod && h.totalAmount !== null,'source_attestation_invalid');
    const currency = extractSourceCurrency(tokens);
    const lines: SourceLine[] = parsed.lines.map(l => ({line_no:l.lineNo,raw_description:l.rawDescription,placement:'placement' in l ? l.placement as string | null : null,
      campaign_name:l.campaignName,external_campaign_id:'externalCampaignId' in l ? l.externalCampaignId as string | null : null,amount:decimalFromDatabase(l.amount),is_adjustment:l.isAdjustment}));
    const header: SourceHeader = {company_id:companyId,platform,invoice_number:h.invoiceNumber,currency,billing_period:h.billingPeriod,issue_date:h.issueDate,
      total_amount:decimalFromDatabase(h.totalAmount),lines_sum:decimalFromDatabase(parsed.linesSum),source:'pdf',source_ref:null,file_path:null};
    let sourceBlocker: unknown = null;
    try { extractSourceIdentity(tokens); } catch(e) { sourceBlocker=e instanceof AdsContractError ? e.details : 'financial_source_required'; }
    const summary = {platform,invoice_number:h.invoiceNumber,billing_period:h.billingPeriod,issue_date:h.issueDate,currency,total_amount:h.totalAmount,lines_sum:parsed.linesSum,
      reconcilia:header.total_amount === header.lines_sum,linhas:lines.length,warnings:parsed.warnings,source_blocker:sourceBlocker};
    // No upload, import, attestation or campaign resolution in dry-run.
    if (body.dry_run === true) return json({...summary,dry_run:true});
    requireThat(body.dry_run === undefined || body.dry_run === false); requireThat(summary.reconcilia,'invalid_plan');
    const result = await importAndAttest({caller,admin,
      archive:{download:async path => {const {data,error}=await admin.storage.from('ads-invoices').download(path); if(error) {if(String(error.statusCode ?? error.status)==='404') return null; throw error;} return data ? new Uint8Array(await data.arrayBuffer()) : null;},
        upload:async(path,content)=>{const {error}=await admin.storage.from('ads-invoices').upload(path,content,{contentType:'application/pdf',upsert:false}); if(error) throw error;}},
      read:async id => {
        const {data:invoice,error}=await caller.from('ads_invoice').select('*').eq('id',id).eq('company_id',companyId).single(); if(error) throw error;
        const {data:storedLines,error:le}=await fetchAllPagedQuery(caller.from('ads_invoice_line').select('*').eq('invoice_id',id).eq('company_id',companyId).order('id')); if(le) throw le;
        return {invoice,lines:storedLines ?? []};
      },
      identity:async(header,digest)=>{
        const extracted=extractSourceIdentity(tokens);
        const [{data:suppliers,error:se},{data:connections,error:le},{data:company,error:co}]=await Promise.all([
          fetchAllPagedQuery(admin.from('suppliers').select('id,company_id,nif,is_active').eq('company_id',companyId).eq('nif',extracted.supplier_nif).order('id')),
          fetchAllPagedQuery(admin.schema('crm').from('ad_platform_connections').select('id,company_id,platform,status,selected_ad_account_id,connection_scope,artist_id').eq('company_id',companyId).eq('platform',platform).eq('selected_ad_account_id',extracted.account_id).order('id')),
          caller.from('companies').select('tax_id').eq('id',companyId).single(),
        ]); if(se || le || co) throw se ?? le ?? co;
        return resolveSourceIdentity(extracted,header,digest,suppliers ?? [],connections ?? [],company.tax_id);
      },
    },header,lines,bytes);
    return json({...summary,...result});
  } catch(error) {return json({error:error instanceof AdsContractError ? error.code : 'internal_error',details:error instanceof AdsContractError ? error.details : undefined},httpStatus(error));}
});
