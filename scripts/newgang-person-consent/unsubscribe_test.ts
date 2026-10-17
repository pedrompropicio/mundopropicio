import {handler} from './unsubscribe-under-test.ts';
import {fake} from './unsubscribe-client.ts';
function eq(a:unknown,b:unknown){if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(JSON.stringify({a,b}));}
async function call(method:string,body?:string,contentType='application/json'){const r=await handler(new Request('https://example.invalid?token=fixture-token',{method,headers:{'content-type':contentType},body}));return {status:r.status,body:await r.json()};}
Deno.test('GET validates only, no mutation',async()=>{fake.used=false;fake.calls=0;eq(await call('GET'),{status:200,body:{valid:true}});eq(fake.calls,0);});
Deno.test('POST invokes one atomic RPC',async()=>{fake.result={success:true};eq(await call('POST','{}'),{status:200,body:{success:true}});eq(fake.calls,1);});
Deno.test('RFC8058 one-click same atomic path',async()=>{fake.calls=0;eq(await call('POST','List-Unsubscribe=One-Click','application/x-www-form-urlencoded'),{status:200,body:{success:true}});eq(fake.calls,1);});
Deno.test('used token preserves visible response',async()=>{fake.used=true;fake.calls=0;eq(await call('POST','{}'),{status:200,body:{valid:false,reason:'already_unsubscribed'}});eq(fake.calls,0);fake.used=false;});
Deno.test('transaction failure explicit no false success',async()=>{fake.error={code:'42501'};eq(await call('POST','{}'),{status:500,body:{error:'Failed to process unsubscribe'}});fake.error=null;});
Deno.test('concurrent consumed response preserved',async()=>{fake.result={valid:false,reason:'already_unsubscribed'};eq(await call('POST','{}'),{status:200,body:{success:false,reason:'already_unsubscribed'}});});