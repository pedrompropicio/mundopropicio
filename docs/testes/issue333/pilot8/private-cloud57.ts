/** Test-only private bridge. No module-load requests; no keys or sessions written to evidence.
 * SELECTs are relayed to the executing agent's official read_query tool via /tmp files.
 * The bridge never runs psql, generic SQL RPC, role/profile/allowlist writes or settings changes.
 */
import { readFile, writeFile, mkdir, stat, mkdtemp } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import type { Artifact, PilotDriver } from './future-runner';
import { validateDocument } from '../../../../supabase/functions/_shared/data-entry-core';

/** Fixture identity is parameterized: a fresh exclusive marker per pilot run, never reused.
 * PILOT8_MARKER must match ^issue333-pilot8-[a-f0-9]{32}$; the old pilot59 marker is refused. */
const RETIRED_MARKERS=new Set(['issue333-pilot8-916bd3976502472ab18f39ea0adf7589','issue333-pilot8-11af044ae28127538fe8cc06be67541a']);
export function resolveMarker57():string {
  const m=process.env.PILOT8_MARKER??'';
  if(!/^issue333-pilot8-[a-f0-9]{32}$/.test(m)) throw Error('PILOT8_MARKER missing or malformed; stop before account');
  if(RETIRED_MARKERS.has(m)) throw Error('Retired fixture marker refused; never reuse fixture59');
  return m;
}
export const MARKER57=process.env.PILOT8_MARKER&&/^issue333-pilot8-[a-f0-9]{32}$/.test(process.env.PILOT8_MARKER)&&!RETIRED_MARKERS.has(process.env.PILOT8_MARKER)?process.env.PILOT8_MARKER:'issue333-pilot8-00000000000000000000000000000000';
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
  get relayDirectory(){return this.directory;}
  /** expectedKeys: schema contract of the single result row. A response missing any
   * expected key is REJECTED — an absent field never degrades into a PASS. */
  async select(query:string, expectedKeys?:string[]):Promise<any> {
    if(!/^SELECT\b/i.test(query.trim()) || /\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|set_config|pg_sleep)\b/i.test(query)) throw Error('SELECT-only bridge refused');
    await mkdir(this.directory,{recursive:true,mode:0o700});
    const id=String(++this.sequence).padStart(4,'0');
    const fingerprint=createHash('sha256').update(query).digest('hex');
    await writeFile(`${this.directory}/${id}.request.json`,JSON.stringify({id,query,fingerprint}),{mode:0o600,flag:'wx'});
    const end=Date.now()+this.deadlineMs;
    while(Date.now()<end) {
      try {
        const raw=await readFile(`${this.directory}/${id}.response.json`,'utf8');
        const data=JSON.parse(raw);
        if(data.error)throw Error('Official SELECT refused');
        // Identity: id must match exactly; a response without id is never accepted.
        if(data.id!==id)throw Error('Official SELECT response identity mismatch');
        // Fingerprint: the relay must echo the hash of the query it actually ran.
        if(data.fingerprint!==fingerprint)throw Error('Official SELECT query fingerprint mismatch');
        const payload=data.data??null;
        const row=Array.isArray(payload)?payload[0]:payload;
        if(row===null||typeof row!=='object'||Array.isArray(row))throw Error('Official SELECT response shape invalid');
        if(expectedKeys) for(const k of expectedKeys) if(!(k in row)) throw Error('Official SELECT response missing expected field: '+k);
        return row;
      }
      catch(e) { if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e; }
      await new Promise(r=>setTimeout(r,200));
    }
    throw Error('Official SELECT bridge response deadline; no account fallback');
  }
}
export class AuthAdmin57 {
  constructor(private base:string,private service:string,private publicKey:string,private transport:typeof fetch=fetch,private timeoutMs=20000){}
  private async request(path:string,method:string,body:unknown,key=this.service) {
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),this.timeoutMs);
    try {
      const response=await this.transport(this.base+path,{method,headers:{apikey:this.publicKey,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});
      if(!response.ok)throw Error(`Auth ${method} refused ${response.status}`);return response.status===204?{}:await response.json();
    } finally {clearTimeout(timer);}
  }
  readProbe(){return this.request('/auth/v1/admin/users?page=1&per_page=1','GET',undefined);}
  create(input:Parameters<PilotDriver['createUser']>[0]) {
    return this.request('/auth/v1/admin/users','POST',{email:input.email,password:input.password,email_confirm:true,user_metadata:{...input.metadata,fixture_marker:resolveMarker57(),pilot_pdf_sha256:SHA57,pilot_pdf_size:1517,pilot_pdf_mime:'application/pdf'}});
  }
  login(email:string,password:string){return this.request('/auth/v1/token?grant_type=password','POST',{email,password},this.publicKey);}
  logout(token:string){return this.request('/auth/v1/logout?scope=global','POST',undefined,token);}
  ban(owner:string){if(!/^[a-f0-9-]{36}$/.test(owner))throw Error('Invalid sole identity');return this.request('/auth/v1/admin/users/'+owner,'PUT',{ban_duration:'876000h'});}
}
export async function exactPdf57(path:string):Promise<Artifact> {
  const marker=resolveMarker57();
  const bytes=new Uint8Array(await readFile(path));validateDocument(bytes,'application/pdf');
  const sha256=createHash('sha256').update(bytes).digest('hex');
  if(bytes.length!==1517 || sha256!==SHA57)throw Error('Reviewed PDF bytes unavailable; stop before account');
  const mode=(await stat(path)).mode&0o777;if(mode!==0o600)throw Error('Private PDF mode must be 0600');
  return {bytes,size:bytes.length,mime:'application/pdf',sha256,reference:'FICTICIO-'+marker,marker,company:COMPANY57};
}
/** Persistent Chromium worker receives credentials ONLY through stdin, never arguments/evidence.
 * Browser implementation must be separately present and verified before any account creation.
 */
export async function chromiumDriver57(script:string,input:unknown):Promise<any> {
  await stat(script);
  return new Promise((resolve,reject)=>{
    const child=spawn('python3',[script],{stdio:['pipe','pipe','pipe'],env:{PATH:process.env.PATH,HOME:'/tmp',PLAYWRIGHT_BROWSERS_PATH:process.env.PLAYWRIGHT_BROWSERS_PATH}});
    const deadline=setTimeout(()=>child.kill('SIGKILL'),180000);
    let stdout='';child.stdout.on('data',x=>{stdout+=x});
    // Never print exception/transport stderr: may contain Authorization values.
    child.stderr.resume();child.on('error',()=>{clearTimeout(deadline);reject(Error('Chromium driver not executable'));});
    child.on('exit',code=>{clearTimeout(deadline);if(code!==0){let stage='unknown';try{stage=JSON.parse(stdout).stage??stage}catch{}return reject(Error('Chromium private worker failed at '+stage+'; read-only recovery only'));}try{resolve(JSON.parse(stdout))}catch{reject(Error('Chromium evidence contract invalid'))}});
    child.stdin.end(JSON.stringify(input));
  });
}
export function privateSecret57(){return randomBytes(32).toString('base64url');}