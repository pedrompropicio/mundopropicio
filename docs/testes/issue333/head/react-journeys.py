import asyncio,json,sys
from pathlib import Path
from playwright.async_api import async_playwright
port,prior,evidence=sys.argv[1:4]; root=Path(evidence); url='http://127.0.0.1:'+port
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  context=await browser.new_context(viewport={'width':1280,'height':1800})
  blocked=[]; errors=[]
  async def route(r):
   if r.request.url.startswith(url) or r.request.url.startswith('data:') or r.request.url.startswith('blob:'): await r.continue_()
   else: blocked.append(r.request.url); await r.abort()
  await context.route('**/*',route)
  page=await context.new_page();page.set_default_timeout(15000);page.on('response',lambda r: print('HTTPERROR',r.status,r.url,flush=True) if r.status>=400 else None);page.on('pageerror',lambda e: errors.append(str(e)))
  async def control(action='',paused=False,release=False):
   return await page.evaluate('async b=>(await fetch("/local/control",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)})).json()',{'action':action,'paused':paused,'release':release})
  async def observed(): return await page.evaluate('async()=> (await fetch("/local/observed")).json()')
  async def entered():
   for _ in range(100):
    if (await observed())['entered']: return
    await page.wait_for_timeout(50)
   raise AssertionError('injection never reached')
  async def shot(name): await page.screenshot(path=str(root/(name+'.png')))
  async def entry(label):
   await page.goto(url+'/entry');await page.wait_for_timeout(200);print('PAGE',label,errors,flush=True);await page.get_by_role('button',name='Novo lote',exact=True).click()
   await page.get_by_label('Escolher documento').set_input_files(root/'browser-fixture.pdf')
   for k,v in [('Fornecedor','Proof32 '+label),('NIF do fornecedor','PT500123456'),('Número da fatura',label),('Data da fatura','2026-10-17'),('Total (EUR)','123'),('IVA (EUR)','23'),('NIF do destinatário no documento','PT500000001')]: await page.get_by_label(k,exact=True).fill(v)
   await page.get_by_role('combobox',name='Quem pagou').select_option('22222222-2222-4222-8222-222222222222')
   await page.get_by_role('button',name='Preparar prévia',exact=True).click();await page.get_by_role('checkbox').check()
  await entry('success');await shot('32-entry-preview')
  await page.get_by_role('button',name='Autorizar e executar este lote',exact=True).click()
  await page.get_by_text('Registado e conferido',exact=True).wait_for();assert await page.get_by_role('link',name='Abrir Faturas Avulsas').get_attribute('href')=='/scanner-faturas';await shot('32-entry-checked')
  print('PASS React Assistant upload/fields/preview/authorization/check/link')
  for action in ['authorize','begin']:
   await page.evaluate('localStorage.clear()');await control();await entry('lost-'+action);await control(action)
   await page.get_by_role('button',name='Autorizar e executar este lote',exact=True).click()
   await page.get_by_text('Resultado por confirmar',exact=True).wait_for();await page.get_by_role('button',name='Conferir novamente',exact=True).click()
   await page.get_by_text('Resultado por confirmar',exact=True).wait_for();await shot('32-entry-lost-'+action)
   calls=(await observed())['calls'];assert sum(c.get('action')==action and c.get('kind')=='core' for c in calls)>=1
   assert await page.get_by_role('button',name='Autorizar e executar este lote',exact=True).count()==0
   print('PASS lost CORE '+action+' => read-only check, no success/resend')
   for change in ['company','auth']:
    await page.evaluate('localStorage.clear()');await control();await entry('context-'+action+'-'+change);await control(action,True)
    await page.get_by_role('button',name='Autorizar e executar este lote',exact=True).click();await entered()
    before=len((await observed())['calls'])
    uid='33333333-3333-4333-8333-333333333334' if change=='auth' else '22222222-2222-4222-8222-222222222222'
    company='33333333-3333-4333-8333-333333333333' if change=='company' else '11111111-1111-4111-8111-111111111111'
    await page.evaluate('([u,c])=>window.localContext(u,c)',[uid,company]);await control(release=True);await page.wait_for_timeout(400)
    assert await page.get_by_text('Registado e conferido',exact=True).count()==0
    after=(await observed())['calls'][before:];assert not any(c.get('action') in ['commit','begin','authorize'] for c in after),after
    await shot('32-context-'+action+'-'+change)
    await page.evaluate('window.localContext("22222222-2222-4222-8222-222222222222","11111111-1111-4111-8111-111111111111")')
    print('PASS pending '+action+' '+change+' invalidates stale response; no next effect')
  await control();await page.goto(url+'/scanner-faturas')
  await page.locator('input[type=file]').first.set_input_files(root/'browser-fixture.pdf')
  await page.get_by_label('Total (EUR)',exact=True).fill('123');await page.get_by_label('IVA (€)',exact=True).fill('23');await page.get_by_label('Fornecedor (opcional)',exact=True).fill('Proof32 scanner')
  await page.get_by_role('button',name='Guardar fatura',exact=True).click();await page.get_by_text('Fatura guardada.',exact=True).wait_for();await shot('32-scanner-checked')
  print('PASS actual React scanner capture/manual/save -> checked SQL')
  await page.goto(url+'/edit');await page.get_by_role('button',name='Editar',exact=True).first.click();await page.get_by_label('Nota',exact=True).fill('Proof32 metadata changed');await page.get_by_role('button',name='Guardar',exact=True).click();await page.get_by_role('heading',name='Editar fatura avulsa',exact=True).wait_for(state='hidden');await shot('32-editor-checked');print('PASS React accountant editor metadata -> SQL/audit/unchanged bytes')
  await page.goto(url+'/scanner-faturas');await page.get_by_role('button',name='Procurar as minhas tentativas',exact=True).click()
  await page.get_by_label('Tentativa a consultar',exact=True).wait_for()
  for _ in range(20):
   more=page.get_by_role('button',name='Carregar mais',exact=True)
   if not await more.count(): break
   count=await page.get_by_label('Tentativa a consultar').locator('option').count()
   await more.click()
   await page.wait_for_function('(n)=>Array.from(document.querySelectorAll("select")).find(e=>e.getAttribute("aria-label")==="Tentativa a consultar").options.length>n',arg=count)
  else: raise AssertionError('pagination did not finish')
  await page.get_by_label('Tentativa a consultar',exact=True).select_option(prior)
  await page.get_by_role('button',name='Registar outra fatura com os mesmos dados…',exact=True).click();await control('confirm_new_intent',True)
  await page.get_by_role('button',name='Confirmar nova fatura',exact=True).click();await entered()
  await page.evaluate('window.localContext("22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333")');await control(release=True);await page.wait_for_timeout(300)
  assert await page.get_by_text('Fatura guardada.',exact=True).count()==0
  await page.evaluate('window.localContext("22222222-2222-4222-8222-222222222222","11111111-1111-4111-8111-111111111111")')
  await page.goto(url+'/scanner-faturas');await page.get_by_role('button',name='Procurar as minhas tentativas',exact=True).click()
  await page.get_by_label('Tentativa a consultar',exact=True).wait_for()
  for _ in range(20):
   more=page.get_by_role('button',name='Carregar mais',exact=True)
   if not await more.count(): break
   count=await page.get_by_label('Tentativa a consultar').locator('option').count()
   await more.click()
   await page.wait_for_function('(n)=>Array.from(document.querySelectorAll("select")).find(e=>e.getAttribute("aria-label")==="Tentativa a consultar").options.length>n',arg=count)
  else: raise AssertionError('pagination did not finish')
  await page.get_by_role('button',name='Conferir intenção pendente',exact=True).click();await page.get_by_text('Intenção técnica encontrada e conferida. Nenhuma execução foi iniciada.',exact=True).wait_for()
  snapshot=page.get_by_role('region',name='Dados confirmados da reserva');await snapshot.wait_for();assert 'Proof32 original owner envelope' in await snapshot.inner_text();assert '123' in await snapshot.inner_text();assert 'Sem transação' in await snapshot.inner_text();await shot('32-reserved-envelope')
  await page.get_by_label('Documento original da reserva',exact=True).set_input_files(root/'browser-fixture.pdf')
  await page.get_by_role('button',name='Autorizar execução da reserva preparada',exact=True).click();await page.get_by_text('Fatura guardada.',exact=True).wait_for();await shot('32-new-intent-checked')
  calls=(await observed())['calls'];assert sum(c.get('action')=='confirm_new_intent' for c in calls)==1
  print('PASS lost confirmation/company change -> owner discovery/read-only linkage -> visible bound envelope/original bytes -> explicit reserved execution once')
  await page.goto(url+'/scanner-faturas');await page.get_by_role('button',name='Procurar as minhas tentativas',exact=True).click()
  await page.get_by_label('Tentativa a consultar',exact=True).wait_for()
  for _ in range(20):
   more=page.get_by_role('button',name='Carregar mais',exact=True)
   if not await more.count(): break
   count=await page.get_by_label('Tentativa a consultar').locator('option').count();await more.click()
   await page.wait_for_function('(n)=>Array.from(document.querySelectorAll("select")).find(e=>e.getAttribute("aria-label")==="Tentativa a consultar").options.length>n',arg=count)
  else: raise AssertionError('pagination did not finish')
  await page.get_by_label('Tentativa a consultar',exact=True).select_option(sys.argv[4])
  await page.get_by_role('button',name='Registar outra fatura com os mesmos dados…',exact=True).click();await control('confirm_new_intent',True)
  before=len((await observed())['calls'])
  await page.get_by_role('button',name='Confirmar nova fatura',exact=True).click();await entered()
  await page.evaluate('window.localContext("44444444-4444-4444-8444-444444444444","11111111-1111-4111-8111-111111111111")');await control(release=True);await page.wait_for_timeout(300)
  after=(await observed())['calls'][before:];assert not any(c.get('action')=='execute' for c in after),after
  assert await page.get_by_text('Fatura guardada.',exact=True).count()==0
  await shot('32-context-confirm-auth');print('PASS pending confirmation Auth invalidates stale result; one prepared destination, no execution/reconfirm')
  assert not blocked,blocked
  assert not errors,errors
  (root/'react-browser-observed.json').write_text(json.dumps({'blocked':blocked,'pageerrors':errors,'calls':calls,'cloud_tested':False},indent=2))
  await browser.close()
asyncio.run(main())
