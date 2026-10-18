"""Actual localhost React app / real fixture session. Secrets stdin only, no credential logs.
Mode probe performs no login/writes. Cloud execution is separate explicit mode.
"""
import asyncio,json,sys,hashlib
from pathlib import Path
from playwright.async_api import async_playwright

STAGE="starting"
async def main():
    global STAGE
    args=json.load(sys.stdin);out=Path(args['output']);out.mkdir(parents=True,exist_ok=True)
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True)
        context=await browser.new_context(viewport={'width':1280,'height':1800})
        page=await context.new_page();errors=[];calls=[];blocked=[];latest={};execute_count=0
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
            if args['mode']=='probe':
                blocked.append('external');await r.abort();return
            if url==endpoint and req.method=='POST':
                if 'application/json' in req.headers.get('content-type',''):
                    body=json.loads(req.post_data or '{}');action=body.get('action');calls.append(action)
                    if action=='execute':
                        if execute_count:await r.abort();raise Exception('Unexpected additional execute')
                        execute_count=2;latest.update(body)
                        responses=await asyncio.gather(context.request.post(url,data=body,headers=req.headers,timeout=20000),context.request.post(url,data=body,headers=req.headers,timeout=20000))
                        statuses=[x.status for x in responses];args['pair_statuses']=statuses
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
            headers={'Authorization':'Bearer '+session['access_token'],'apikey':args['public_key'],'X-Data-Entry-User':args['owner'],'X-Data-Entry-Company':args['company']}
            STAGE='read-only-check'
            check=await context.request.post(endpoint,headers=headers,data={'action':'check','session_id':latest['session_id'],'preview_id':latest['preview_id']},timeout=20000)
            body=await check.json();assert check.status==200 and body.get('status')=='conferido'
            STAGE='reopen'
            await page.reload()
            if not args.get('dialog_open'):await page.get_by_title('Assistente de Entrada de Dados (#333)').click()
            await page.get_by_role('button',name='Retomar último lote',exact=True).click()
            await page.get_by_text('Registado e conferido',exact=True).wait_for(timeout=20000)
            await page.screenshot(path=str(out/'reopened.png'))
            # Sanitized fixture-only evidence; result excludes any bearer/session data.
            STAGE='no-egress-evidence'
            if args.get('isolated'):(out/'network58.json').write_text(json.dumps({'errors':errors,'blocked':blocked}))
            assert not errors and not blocked
            evidence={'executeRequests':execute_count,'pair_statuses':args.get('pair_statuses'),'calls':calls,'latest':latest,'check':body,'reopenedCheckOk':True,'errors':errors,'blocked':blocked,'cloud_tested':not args.get('isolated',False)}
            (out/'browser.json').write_text(json.dumps(evidence,indent=2))
            print(json.dumps(evidence))
        finally:await context.close();await browser.close()

try:asyncio.run(main())
except Exception:
    # Never print Playwright request errors, URLs, headers or supplied session.
    print(json.dumps({'error':'private_browser_flow_failed','stage':STAGE,'repeat_forbidden':True}));sys.exit(1)