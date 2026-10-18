/** Test-only private bridge. No module-load requests; no keys or sessions written to evidence.
 * SELECTs are relayed to the executing agent's official read_query tool via /tmp files.
 * The bridge never runs psql, generic SQL RPC, role/profile/allowlist writes or settings changes.
 */
import { readFile, writeFile, mkdir, stat, mkdtemp } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import type { Artifact, PilotDriver } from './future-runner';
import { validateDocument } from '../../../../supabase/functions/_shared/data-entry-core';

export const MARKER57='issue333-pilot8-916bd3976502472ab18f39ea0adf7589';
export const COMPANY57='7c858982-6ccd-47ca-bd65-e0dd3eebf01c';
export const SHA57='8ae66f6a452934a1f43a5d9fb2c5f22fef7e407e4d2f1b8db53f03d75794798f';
export class OfficialSelectBridge {
  private sequence=0;
  constructor(private directory:string, private deadlineMs=20000) {
    if(!directory.startsWith('/tmp/')) throw Error('Private bridge requires /tmp');
  }
  static async fresh(root='/tmp/issue333-select58-', deadlineMs=60000) {
    return new OfficialSelectBridge(await mkdtemp(root),deadlineMs);
  }
  async select(query:string):Promise<any> {
    if(!/^SELECT\b/i.test(query.trim()) || /\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|set_config|pg_sleep)\b/i.test(query)) throw Error('SELECT-only bridge refused');
    await mkdir(this.directory,{recursive:true,mode:0o700});
    const id=String(++this.sequence).padStart(4,'0');
    await writeFile(`${this.directory}/${id}.request.json`,JSON.stringify({id,query}),{mode:0o600,flag:'wx'});
    const end=Date.now()+this.deadlineMs;
    while(Date.now()<end) {
      try { const data=JSON.parse(await readFile(`${this.directory}/${id}.response.json`,'utf8'));if(data.error)throw Error('Official SELECT refused');if(data.id!==undefined&&data.id!==id)throw Error('Official SELECT response identity mismatch');const payload=data.data??data;return Array.isArray(payload)?payload[0]:payload; }
      catch(e) { if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e; }
      await new Promise(r=>setTimeout(r,200));
    }
    throw Error('Official SELECT bridge response deadline; no account fallback');
  }
}
export class AuthAdmin57 {
  constructor(private base:string,private service:string,private publicKey:string,private transport:typeof fetch=fetch){}
  private async request(path:string,method:string,body:unknown,key=this.service) {
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
    try {
      const response=await this.transport(this.base+path,{method,headers:{apikey:this.publicKey,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});
      if(!response.ok)throw Error(`Auth ${method} refused ${response.status}`);return response.status===204?{}:await response.json();
    } finally {clearTimeout(timer);}
  }
  readProbe(){return this.request('/auth/v1/admin/users?page=1&per_page=1','GET',undefined);}
  create(input:Parameters<PilotDriver['createUser']>[0]) {
    return this.request('/auth/v1/admin/users','POST',{email:input.email,password:input.password,email_confirm:true,user_metadata:{...input.metadata,pilot_pdf_sha256:SHA57,pilot_pdf_size:1517,pilot_pdf_mime:'application/pdf'}});
  }
  login(email:string,password:string){return this.request('/auth/v1/token?grant_type=password','POST',{email,password},this.publicKey);}
  logout(token:string){return this.request('/auth/v1/logout?scope=global','POST',undefined,token);}
  ban(owner:string){if(!/^[a-f0-9-]{36}$/.test(owner))throw Error('Invalid sole identity');return this.request('/auth/v1/admin/users/'+owner,'PUT',{ban_duration:'876000h'});}
}
export async function exactPdf57(path:string):Promise<Artifact> {
  const bytes=new Uint8Array(await readFile(path));validateDocument(bytes,'application/pdf');
  if(bytes.length!==1517 || createHash('sha256').update(bytes).digest('hex')!==SHA57)throw Error('Reviewed PDF bytes unavailable; stop before account');
  const mode=(await stat(path)).mode&0o777;if(mode!==0o600)throw Error('Private PDF mode must be 0600');
  return {bytes,size:1517,mime:'application/pdf',sha256:SHA57,reference:'FICTICIO-'+MARKER57,marker:MARKER57,company:COMPANY57};
}
/** Persistent Chromium worker receives credentials ONLY through stdin, never arguments/evidence.
 * Browser implementation must be separately present and verified before any account creation.
 */
export async function chromiumDriver57(script:string,input:unknown):Promise<any> {
  await stat(script);
  return new Promise((resolve,reject)=>{
    const child=spawn('python3',[script],{stdio:['pipe','pipe','pipe'],env:{PATH:process.env.PATH,HOME:'/tmp',PLAYWRIGHT_BROWSERS_PATH:process.env.PLAYWRIGHT_BROWSERS_PATH}});
    let stdout='';child.stdout.on('data',x=>{stdout+=x});
    // Never print exception/transport stderr: may contain Authorization values.
    child.stderr.resume();child.on('error',()=>reject(Error('Chromium driver not executable')));
    child.on('exit',code=>{if(code!==0){let stage='unknown';try{stage=JSON.parse(stdout).stage??stage}catch{}return reject(Error('Chromium private worker failed at '+stage+'; read-only recovery only'));}try{resolve(JSON.parse(stdout))}catch{reject(Error('Chromium evidence contract invalid'))}});
    child.stdin.end(JSON.stringify(input));
  });
}
export function privateSecret57(){return randomBytes(32).toString('base64url');}