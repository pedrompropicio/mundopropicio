import {it,expect} from 'vitest';
import {mkdtemp,writeFile,chmod} from 'node:fs/promises';
import {AuthAdmin57,OfficialSelectBridge,exactPdf57} from '../../docs/testes/issue333/pilot8/private-cloud57';
it('real HTTP AuthAdmin driver makes exact sole create metadata, logout global and ban only supplied identity without emails',async()=>{
 const calls:any[]=[];const transport:typeof fetch=async(url,options)=>{calls.push({url:String(url),method:options?.method,body:options?.body?JSON.parse(String(options.body)):null});return new Response(JSON.stringify({id:'11111111-1111-4111-8111-111111111111'}),{status:200})};
 const driver=new AuthAdmin57('http://local','local-service','local-public',transport);
 await driver.create({email:'fiction@fixture.invalid',password:'local-only',email_confirm:true,metadata:{fixture_marker:'fixture',company_id:'company',full_name:'Fictício'}});
 await driver.logout('local-token');await driver.ban('11111111-1111-4111-8111-111111111111');
 expect(calls[0].body.user_metadata.pilot_pdf_size).toBe(1517);expect(calls[0].body.email_confirm).toBe(true);expect(calls[1].url).toBe('http://local/auth/v1/logout?scope=global');expect(calls[2].method).toBe('PUT');expect(calls).toHaveLength(3);
});
it('official SELECT spool is executable without credentials and rejects every write before transport',async()=>{
 const dir=await mkdtemp('/tmp/issue333-bridge57-');const driver=new OfficialSelectBridge(dir,1000);
 const response=driver.select('SELECT 1 AS n');await new Promise(r=>setTimeout(r,50));await writeFile(dir+'/0001.response.json',JSON.stringify({n:1}),{mode:0o600});expect(await response).toEqual({n:1});
 await expect(driver.select('UPDATE user_roles SET role=\'manager\'')).rejects.toThrow('SELECT-only');
});
it('exact HEAD PDF is checked before account and private permission is enforced',async()=>{
 const dir=await mkdtemp('/tmp/issue333-pdf57-');const {readFile}=await import('node:fs/promises');const file=dir+'/fiction.pdf';await writeFile(file,await readFile('docs/testes/issue333/pilot8/preflight56/evidence/pilot8-fiction.pdf'),{mode:0o600});expect((await exactPdf57(file)).size).toBe(1517);await chmod(file,0o644);await expect(exactPdf57(file)).rejects.toThrow('0600');
});