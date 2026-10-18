import {it,expect} from 'vitest';
import {runFuturePilot,type PilotDriver,type Artifact} from '../../docs/testes/issue333/pilot8/future-runner';
const artifact:Artifact={bytes:new Uint8Array(64),size:64,mime:'application/pdf',sha256:'a'.repeat(64),reference:'FICTICIO-one',marker:'issue333-pilot8-'+'1'.repeat(32),company:'company'};
function harness(){let now=0;const calls:string[]=[];const driver:PilotDriver={
 validatePdf:async()=>{calls.push('pdf')},preflightReadOnly:async()=>({markerAbsent:true,referenceAbsent:true,sourcesExact:true,globalsClosed:true,allowlistCount:0}),
 createUser:async input=>{expect(input.email_confirm).toBe(true);calls.push('create');return {id:'owner',createdAt:'date'}},readReady:async()=>({owner:'owner',company:'company',marker:artifact.marker,role:'manager',sessionCount:0,activeCompany:null,canonicalCompany:'company',preparation:true,assistantCreate:true,globalOpen:false,expiresAt:600000}),notifyController:async()=>{calls.push('notify')},
 login:async()=>{calls.push('login');return {owner:'owner',token:'memory-only'}},chromium:async()=>({sessions:1,documents:1,previews:1,executeRequests:2,invoices:1,results:1,financialEffects:0,downloadedSha:artifact.sha256,approvedOwner:'owner',approvedNameFromServer:true,reopenedCheckOk:true}),requestRevocation:async()=>{calls.push('revoke')},readRevoked:async()=>({count:2,disabled:2}),checkReadOnly:async()=>({ok:true,extraWrites:0}),
 logoutGlobal:async()=>{calls.push('logout')},banOnlyCreatedUser:async id=>{expect(id).toBe('owner');calls.push('ban')},readSessionCount:async()=>{calls.push('sessions');return 0},finalBaselines:async()=>({financialUnchanged:true,priorCandidatesPreserved:true,globalsClosed:true}),now:()=>now,wait:async ms=>{now+=ms},secret:()=>{calls.push('secret');return 'memory-only'}};return {driver,calls};}
it('validates PDF before sole create; NULL active canonical membership; cleanup after exact one-preview flow',async()=>{const h=harness();await runFuturePilot(h.driver,artifact,'PEDRO_AUTHORIZED_SINGLE_PILOT8');expect(h.calls).toEqual(['pdf','secret','create','notify','login','revoke','logout','ban','sessions'])});
it('five-minute readiness timeout never logs in or creates replacement, still bans sole identity',async()=>{const h=harness();h.driver.readReady=async()=>null;await expect(runFuturePilot(h.driver,artifact,'PEDRO_AUTHORIZED_SINGLE_PILOT8')).rejects.toThrow('deadline');expect(h.calls.filter(x=>x==='create')).toHaveLength(1);expect(h.calls).not.toContain('login');expect(h.calls).toContain('ban')});
it('invalid PDF forbids account and password creation',async()=>{const h=harness();h.driver.validatePdf=async()=>{throw Error('invalid PDF')};await expect(runFuturePilot(h.driver,artifact,'PEDRO_AUTHORIZED_SINGLE_PILOT8')).rejects.toThrow('invalid PDF');expect(h.calls).toEqual([])});
it('uncertain execute never retries; independent logout failure still bans and verifies sessions',async()=>{const h=harness();let executions=0;h.driver.chromium=async()=>{executions++;throw Error('uncertain')};h.driver.logoutGlobal=async()=>{h.calls.push('logout');throw Error('logout')};await expect(runFuturePilot(h.driver,artifact,'PEDRO_AUTHORIZED_SINGLE_PILOT8')).rejects.toThrow('Cleanup proof incomplete');expect(executions).toBe(1);expect(h.calls.slice(-3)).toEqual(['logout','ban','sessions'])});
it('without separate future authorization performs no action',async()=>{const h=harness();await expect(runFuturePilot(h.driver,artifact,'PREFLIGHT_ONLY')).rejects.toThrow('authorization');expect(h.calls).toEqual([])});
it('logout AND ban failures both surface in cleanup error; sessions verification still runs independently',async()=>{
 const h=harness();
 h.driver.logoutGlobal=async()=>{h.calls.push('logout');throw Error('logout')};
 h.driver.banOnlyCreatedUser=async()=>{h.calls.push('ban');throw Error('ban')};
 await expect(runFuturePilot(h.driver,artifact,'PEDRO_AUTHORIZED_SINGLE_PILOT8')).rejects.toThrow('Cleanup proof incomplete: global_logout,ban_created_user');
 expect(h.calls).toContain('sessions');
});
it('sessions verification failure alone blocks completion even with clean logout and ban',async()=>{
 const h=harness();
 h.driver.readSessionCount=async()=>{h.calls.push('sessions');return 1};
 await expect(runFuturePilot(h.driver,artifact,'PEDRO_AUTHORIZED_SINGLE_PILOT8')).rejects.toThrow('Cleanup proof incomplete: sessions_zero');
});
