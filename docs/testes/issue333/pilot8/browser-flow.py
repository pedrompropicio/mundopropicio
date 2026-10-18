"""One local Chromium journey. No Cloud identity, credentials or external network."""
import asyncio, hashlib, json, sys
from pathlib import Path
from playwright.async_api import async_playwright
async def main():
    url='http://127.0.0.1:'+sys.argv[1];out=Path(sys.argv[2])
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True)
        context=await browser.new_context(viewport={'width':1280,'height':1800})
        errors=[];blocked=[]
        async def route(r):
            if r.request.url.startswith(url) or r.request.url.startswith(('data:','blob:')): await r.continue_()
            else: blocked.append(r.request.url);await r.abort()
        await context.route('**/*',route)
        page=await context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        try:
            await page.goto(url+'/entry');await page.get_by_role('button',name='Novo lote',exact=True).click()
            await page.get_by_label('Escolher documento').set_input_files(out/'pilot8-fiction.pdf')
            for k,v in [('Fornecedor','FICTICIO PILOTO8'),('NIF do fornecedor','PT000000000'),('Número da fatura','FICTICIO-PREFLIGHT56'),('Data da fatura','2026-10-18'),('Total (EUR)','0'),('IVA (EUR)','0'),('NIF do destinatário no documento','PT500000001')]:
                await page.get_by_label(k,exact=True).fill(v)
            await page.get_by_role('combobox',name='Quem pagou').select_option('22222222-2222-4222-8222-222222222222')
            await page.get_by_role('button',name='Preparar prévia',exact=True).click()
            checkbox=page.get_by_role('checkbox');await checkbox.wait_for()
            assert 'Autorizador Fictício' in await page.get_by_role('region',name='Autorização').inner_text() if await page.get_by_role('region',name='Autorização').count() else 'Autorizador Fictício' in await page.locator('body').inner_text()
            await page.screenshot(path=str(out/'preview.png'))
            await checkbox.check()
            await page.get_by_role('button',name='Autorizar e executar este lote',exact=True).dblclick()
            await page.get_by_text('Registado e conferido',exact=True).wait_for()
            await page.screenshot(path=str(out/'checked.png'))
            verify=await page.evaluate('async()=> (await fetch("/local/verify")).json()')
            expected=hashlib.sha256((out/'pilot8-fiction.pdf').read_bytes()).hexdigest()
            assert verify['sha256']==expected and verify['size']==(out/'pilot8-fiction.pdf').stat().st_size
            assert verify['doubleCount']==2
            assert verify['counts']==[{'invoices':1,'sessions':1,'previews':1,'results':1,'audits':1}]
            assert verify['invoice']['currency']=='EUR' and float(verify['invoice']['total_amount'])==0 and float(verify['invoice']['iva_amount'])==0
            assert 'Feito por LLM com autorização de Autorizador Fictício' in verify['invoice']['notes']
            await page.reload();await page.get_by_role('button',name='Retomar último lote',exact=True).click()
            await page.get_by_text('Registado e conferido',exact=True).wait_for()
            revoke=await page.evaluate('async()=> (await fetch("/local/revoke",{method:"POST"})).json()')
            assert revoke['rows']==2 and revoke['status']==200 and revoke['body']['status']=='conferido'
            assert revoke['uploads_before']==revoke['uploads_after']
            await page.screenshot(path=str(out/'revoked-readonly.png'))
            assert not errors,errors
            (out/'browser-evidence.json').write_text(json.dumps({'verify':verify,'revoked':revoke,'errors':errors,'blocked_external':blocked,'cloud_tested':False},indent=2))
            print('PASS real React preview/explicit name/double same-preview execute/download SHA/reopen/revoked read-only; Cloud not exercised')
        finally:
            await context.close();await browser.close()
asyncio.run(main())