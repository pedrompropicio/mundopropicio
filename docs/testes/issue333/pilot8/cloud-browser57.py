"""Actual localhost React app / real fixture session. Secrets stdin only, no credential logs.
Mode probe performs no login/writes. Cloud execution is separate explicit mode.
Evidence (browser.json) is persisted ATOMICALLY in a finally block, before any final
assert can abort the run: pair HTTP statuses and both execute bodies are captured as
local variables, never stored on the args dict. Real errors are recorded sanitized
(type/stage only), never raw transport text that could carry headers.
"""
import asyncio,json,sys,hashlib,os
from pathlib import Path
from playwright.async_api import async_playwright

STAGE="starting"
def sanitize_error(exc):
    # Type and stage only; never str(exc) which may embed URLs/headers/tokens.
    return {'type':type(exc).__name__,'stage':STAGE}
def atomic_write_json(path,payload):
    tmp=path.with_suffix('.tmp')
    tmp.write_text(json.dumps(payload,indent=2))
    os.replace(tmp,path)
async def main():
    global STAGE
    args=json.load(sys.stdin);out=Path(args['output']);out.mkdir(parents=True,exist_ok=True)
    evidence={'executeRequests':0,'pair_statuses':None,'pair_bodies':None,'calls':[],'latest':{},'check':None,'reopenedCheckOk':False,'errors':[],'blocked':[],'cloud_tested':not args.get('isolated',False),'failure':None}
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True)
        context=await browser.new_context(viewport={'width':1280,'height':1800})
        page=await context.new_page();errors=evidence['errors'];calls=evidence['calls'];blocked=evidence['blocked'];latest=evidence['latest'];execute_count=0
        page.on('pageerror',lambda e:errors.append(type(e).__name__))
        base=args['cloud_url'];endpoint=base+'/functions/v1/data-entry'
        local=args.get('app_url','http://localhost:8080')
        if args.get('isolated'):
            from urllib.parse import urlparse
            assert urlparse(base).hostname in ('127.0.0.1','localhost') and urlparse(local).hostname in ('127.0.0.1','localhost')
        async def route(r):
            nonlocal execute_count
            req=r.request;url=req.url
            if (url.startswith(local+'/') and not url.startswith(endpoint)) or url.startswith(('blob:','data:')):
                await r.continue_();return
            if args['mode'] in ('probe','preflight'):
                blocked.append('external');await r.abort();return
            if url==endpoint and req.method=='POST':
                if 'application/json' in req.headers.get('content-type',''):
                    body=json.loads(req.post_data or '{}');action=body.get('action');calls.append(action)
                    if action=='execute':
                        if execute_count:await r.abort();raise Exception('Unexpected additional execute')
                        execute_count=2;latest.update(body)
                        responses=await asyncio.gather(context.request.post(url,data=body,headers=req.headers,timeout=20000),context.request.post(url,data=body,headers=req.headers,timeout=20000))
                        # Local variables only; both statuses AND sanitized bodies preserved.
                        statuses=[x.status for x in responses]
                        bodies=[]
                        for x in responses:
                            try:
                                b=await x.json()
                                bodies.append({k:b.get(k) for k in ('status','error') if k in b})
                            except Exception:bodies.append(None)
                        evidence['pair_statuses']=statuses;evidence['pair_bodies']=bodies
                        response=next((x for x in responses if x.status==200),responses[0])
                        await r.fulfill(response=response);return
                else:calls.append('upload')
                await r.continue_();return
            # App's identity and company reads only. Never forward email/AI/integration functions.
            if url.startswith(base+'/auth/v1/user') and req.method=='GET':await r.continue_();return
            if url.startswith(base+'/rest/v1/'):
                if req.method=='GET':await r.continue_();return
                if req.method=='POST' and '/rpc/' in url and url.rsplit('/',1)[-1] in ['my_effective_permissions','current_company_id','get_user_companies','get_active_company','get_transactions_paginated','get_transactions_summary']:
                    await r.continue_();return
            if req.resource_type in ('font','stylesheet'):
                await r.fulfill(status=200,body='');return
            blocked.append(req.method+' '+url.split('/')[-1].split('?')[0]);await r.abort()
        await context.route('**/*',route)
        try:
            STAGE='open-'+args['mode']
            await page.goto(local+args.get('start_path','/'),wait_until='domcontentloaded')
            if args['mode']=='probe':
                await page.screenshot(path=str(out/'probe.png'))
                print(json.dumps({'probe':True,'page_loaded':True,'cloud_writes':0,'errors':errors}));return
            if args['mode']=='preflight':
                assert not args.get('session')
                await page.screenshot(path=str(out/'preflight.png'))
                print(json.dumps({'preflight':True,'page_loaded':True,'executeRequests':0,'errors':errors}));return
            assert args['mode']=='execute'
            # Same-origin only, never add_init_script or restore an administrative identity.
            session=args['session'];assert session['user']['id']==args['owner']
            await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[args['storage_key'],json.dumps(session)])
            await page.goto(local+args.get('entry_path','/transacoes'),wait_until='domcontentloaded')
            if not args.get('dialog_open'):await page.get_by_title('Assistente de Entrada de Dados (#333)').click(timeout=20000)
            STAGE='new-session'
            await page.get_by_role('button',name='Novo lote',exact=True).click(timeout=20000)
            STAGE='upload'
            await page.get_by_label('Escolher documento').set_input_files(args['pdf'])
            # Wait for real session response by enabled metadata fields.
            supplier=page.get_by_label('Fornecedor',exact=True);await supplier.wait_for()
            await supplier.wait_for(state='visible')
            await page.wait_for_function('()=>Array.from(document.querySelectorAll("input")).filter(e=>!e.disabled).length>=5')
            for name,value in [('Fornecedor','FICTICIO PILOTO8'),('NIF do fornecedor','PT000000000'),('Número da fatura',args['reference']),('Data da fatura','2026-10-18'),('Total (EUR)','0'),('IVA (EUR)','0'),('NIF do destinatário no documento',args['tax_id']),('Nota (opcional)','DOCUMENTO FICTICIO PILOTO8 - SEM EFEITOS FINANCEIROS')]:
                await page.get_by_label(name,exact=True).fill(value,timeout=20000)
            await page.get_by_role('combobox',name='Quem pagou').select_option(args['owner'])
            STAGE='prepare'
            await page.get_by_role('button',name='Preparar prévia',exact=True).click()
            await page.get_by_role('checkbox').wait_for(timeout=20000)
            text=await page.get_by_role('region',name='Autorização').inner_text() if await page.get_by_role('region',name='Autorização').count() else await page.locator('body').inner_text()
            assert args['actor_name'] in text and args['reference'] in text
            await page.screenshot(path=str(out/'preview.png'))
            await page.get_by_role('checkbox').check()
            STAGE='execute'
            await page.get_by_role('button',name='Autorizar e executar este lote',exact=True).dblclick()
            # No retry after ambiguous result. The sole next request is read-only check.
            try:await page.get_by_text('Registado e conferido',exact=True).wait_for(timeout=20000)
            except Exception:pass
            await page.screenshot(path=str(out/'outcome.png'))
            STAGE='pair-evidence'
            assert latest and execute_count==2
            assert evidence['pair_statuses'] is not None and len(evidence['pair_statuses'])==2,'pair HTTP statuses not captured'
            headers={'Authorization':'Bearer '+session['access_token'],'apikey':args['public_key'],'X-Data-Entry-User':args['owner'],'X-Data-Entry-Company':args['company']}
            STAGE='read-only-check'
            check=await context.request.post(endpoint,headers=headers,data={'action':'check','session_id':latest['session_id'],'preview_id':latest['preview_id']},timeout=20000)
            body=await check.json();assert check.status==200 and body.get('status')=='conferido'
            evidence['check']={k:body.get(k) for k in ('status',) if k in body}
            STAGE='reopen'
            await page.reload()
            if not args.get('dialog_open'):await page.get_by_title('Assistente de Entrada de Dados (#333)').click()
            await page.get_by_role('button',name='Retomar último lote',exact=True).click()
            await page.get_by_text('Registado e conferido',exact=True).wait_for(timeout=20000)
            await page.screenshot(path=str(out/'reopened.png'))
            evidence['reopenedCheckOk']=True
            # Sanitized fixture-only evidence; result excludes any bearer/session data.
            STAGE='no-egress-evidence'
            if args.get('isolated'):(out/'network58.json').write_text(json.dumps({'errors':errors,'blocked':blocked}))
            assert not errors and not blocked
            evidence['executeRequests']=execute_count
            print(json.dumps(evidence))
        except Exception as exc:
            evidence['failure']=sanitize_error(exc)
            raise
        finally:
            # Evidence persisted BEFORE browser teardown and regardless of assert outcome.
            evidence['executeRequests']=execute_count
            atomic_write_json(out/'browser.json',evidence)
            await context.close();await browser.close()

try:asyncio.run(main())
except Exception:
    # Never print Playwright request errors, URLs, headers or supplied session.
    print(json.dumps({'error':'private_browser_flow_failed','stage':STAGE,'repeat_forbidden':True}));sys.exit(1)
