/** INERT orchestration. No concrete Cloud client, network or credentials at module load.
 * The authorized executor supplies AuthAdmin and SELECT-only controller bridges later.
 * No admin login; no role/profile/allowlist SQL execution in this runner.
 */
export type Artifact = { bytes: Uint8Array; sha256: string; size: number; mime: 'application/pdf'; reference: string; marker: string; company: string };
type Identity = { id: string; createdAt: string };
type Ready = { owner: string; company: string; marker: string; role: string; sessionCount: number; activeCompany: string | null; canonicalCompany: string; preparation: boolean; assistantCreate: boolean; globalOpen: boolean; expiresAt: number };
export interface PilotDriver {
  validatePdf(artifact: Artifact): Promise<void>;
  preflightReadOnly(artifact: Artifact): Promise<{ markerAbsent: boolean; referenceAbsent: boolean; sourcesExact: boolean; globalsClosed: boolean; allowlistCount: number }>;
  createUser(input: { email: string; password: string; email_confirm: true; metadata: { fixture_marker: string; company_id: string; full_name: string; pilot_pdf_sha256?: string; pilot_pdf_size?: number; pilot_pdf_mime?: string } }): Promise<Identity>;
  readReady(owner: Identity, artifact: Artifact): Promise<Ready | null>;
  notifyController(identity: Identity, artifact: Artifact): Promise<void>;
  login(email: string, password: string): Promise<{ owner: string; token: string }>;
  /** Runs the real React page with this session, captures binding preview, then one UI
   * authorization and EXACTLY two coordinated execute requests on that same preview.
   * Reads persisted metadata/download bytes, reopens only that session. No retry/UUID reset.
   */
  chromium(identity: Identity, token: string, artifact: Artifact): Promise<{ sessions: number; documents: number; previews: number; executeRequests: number; invoices: number; results: number; financialEffects: number; downloadedSha: string; approvedOwner: string; approvedNameFromServer: boolean; reopenedCheckOk: boolean }>;
  /** Controller updates ONLY the two reviewed rows enabled=false, no DELETE. */
  requestRevocation(identity: Identity, artifact: Artifact): Promise<void>;
  readRevoked(identity: Identity, artifact: Artifact): Promise<{ count: number; disabled: number }>;
  checkReadOnly(identity: Identity, token: string, artifact: Artifact): Promise<{ ok: boolean; extraWrites: number }>;
  logoutGlobal(token: string): Promise<void>;
  banOnlyCreatedUser(owner: string): Promise<void>;
  readSessionCount(owner: string): Promise<number>;
  finalBaselines(identity: Identity, artifact: Artifact): Promise<{ financialUnchanged: boolean; priorCandidatesPreserved: boolean; globalsClosed: boolean }>;
  now(): number; wait(ms: number): Promise<void>; secret(): string;
}
function assert(value: boolean, message: string): asserts value { if (!value) throw Error(message); }
export async function runFuturePilot(driver: PilotDriver, artifact: Artifact, authorization: string) {
  assert(authorization === 'PEDRO_AUTHORIZED_SINGLE_PILOT8', 'Separate future authorization required');
  await driver.validatePdf(artifact); // BEFORE password generation / the sole account.
  const pre = await driver.preflightReadOnly(artifact);
  assert(pre.markerAbsent && pre.referenceAbsent && pre.sourcesExact && pre.globalsClosed && pre.allowlistCount === 0, 'Read-only preflight refused');
  let password = driver.secret(), token = '', owner: Identity | undefined, revocationProven=false;
  const cleanupErrors: string[] = [];
  try {
    owner = await driver.createUser({ email: artifact.marker+'@fixture.invalid', password, email_confirm: true,
      metadata: { fixture_marker: artifact.marker, company_id: artifact.company, full_name: 'Membro Fictício Piloto8', pilot_pdf_sha256:artifact.sha256,pilot_pdf_size:artifact.size,pilot_pdf_mime:artifact.mime } });
    await driver.notifyController(owner, artifact); // IDs/created_at only; never password/JWT.
    const deadline=driver.now()+300_000;
    let ready=false;
    while(driver.now()<deadline) {
      const row=await driver.readReady(owner,artifact);
      if(row) {
        assert(row.owner===owner.id && row.company===artifact.company && row.marker===artifact.marker && row.sessionCount===0 && !row.globalOpen, 'Readiness identity/flags drift');
        if(row.preparation && row.assistantCreate) {
          assert(row.role==='manager' && row.canonicalCompany===artifact.company && (row.activeCompany===null || row.activeCompany===artifact.company) && row.expiresAt>driver.now(), 'Canonical readiness refused');
          ready=true;break;
        }
      }
      await driver.wait(1000);
    }
    assert(ready,'Controller readiness deadline; no login, no second account');
    const session=await driver.login(artifact.marker+'@fixture.invalid',password);
    assert(session.owner===owner.id,'Login identity drift');token=session.token;password='';
    const result=await driver.chromium(owner,token,artifact);
    assert(result.sessions===1 && result.documents===1 && result.previews===1 && result.executeRequests===2 && result.invoices===1 && result.results===1 && result.financialEffects===0 && result.downloadedSha===artifact.sha256 && result.approvedOwner===owner.id && result.approvedNameFromServer && result.reopenedCheckOk,'Single-preview pilot evidence mismatch; read-only recovery only');
    await driver.requestRevocation(owner,artifact);
    const revoked=await driver.readRevoked(owner,artifact);assert(revoked.count===2 && revoked.disabled===2,'Exclusive two-row revocation not proven');revocationProven=true;
    const check=await driver.checkReadOnly(owner,token,artifact);assert(check.ok && check.extraWrites===0,'Revoked read-only check failed');
    return { status: 'verified', cloudPilot: true };
  } finally {
    if(owner) {
      if(!revocationProven) try {
        // Read first: uncertainty never repeats a mutation already committed.
        const state=await driver.readRevoked(owner,artifact);
        if(state.count===2 && state.disabled!==2) await driver.requestRevocation(owner,artifact);
        const after=await driver.readRevoked(owner,artifact);
        assert(after.count===0 || (after.count===2 && after.disabled===2),'revocation unresolved');
      } catch { cleanupErrors.push('scoped_revocation'); }
      // Independent cleanup attempts: logout failure never suppresses ban or sessions proof.
      if(token) try { await driver.logoutGlobal(token); } catch { cleanupErrors.push('global_logout'); }
      try { await driver.banOnlyCreatedUser(owner.id); } catch { cleanupErrors.push('ban_created_user'); }
      try { assert(await driver.readSessionCount(owner.id)===0,'sessions remain'); } catch { cleanupErrors.push('sessions_zero'); }
      try { const b=await driver.finalBaselines(owner,artifact);assert(b.financialUnchanged && b.priorCandidatesPreserved && b.globalsClosed,'baseline drift'); } catch { cleanupErrors.push('final_baselines'); }
    }
    password='';token='';
    if(cleanupErrors.length) throw Error('Cleanup proof incomplete: '+cleanupErrors.join(','));
  }
}