// Test multi-tenant isolation by creating 2 users in 2 companies and verifying
// each can only see their own data via RLS (as logged-in user, NOT service role).
//
// Caller must be platform_admin. Endpoint creates 2 throwaway companies + 2 users,
// signs each in via password grant, runs cross-tenant probes, cleans everything up.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  authenticateAndResolveCompany,
  corsHeaders,
  errorResponse,
  jsonResponse,
} from "../_shared/multiTenant.ts";

interface TestResult { name: string; passed: boolean; detail?: string }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ctx = await authenticateAndResolveCompany(req);
    if (!ctx.isPlatformAdmin) return jsonResponse({ error: "platform_admin only" }, 403);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = ctx.adminClient;

    const stamp = Date.now();
    const results: TestResult[] = [];
    const cleanup: Array<() => Promise<void>> = [];

    // 1. Create 2 throwaway companies
    const { data: co1, error: e1 } = await admin.from("companies").insert({
      name: `__test_isolation_A_${stamp}`, status: "active", country: "PT"
    }).select("id").single();
    if (e1) throw new Error(`create co1: ${e1.message}`);
    cleanup.unshift(async () => { await admin.from("companies").delete().eq("id", co1.id); });

    const { data: co2, error: e2 } = await admin.from("companies").insert({
      name: `__test_isolation_B_${stamp}`, status: "active", country: "PT"
    }).select("id").single();
    if (e2) throw new Error(`create co2: ${e2.message}`);
    cleanup.unshift(async () => { await admin.from("companies").delete().eq("id", co2.id); });

    // 2. Create 2 users (one per company) with admin role inside their tenant
    const pwd = `TestPwd_${stamp}_!Aa9`;
    const emailA = `__iso_a_${stamp}@test.local`;
    const emailB = `__iso_b_${stamp}@test.local`;

    const { data: userA, error: ua } = await admin.auth.admin.createUser({
      email: emailA, password: pwd, email_confirm: true,
      user_metadata: { company_id: co1.id, full_name: "Iso A" },
    });
    if (ua) throw new Error(`create userA: ${ua.message}`);
    cleanup.unshift(async () => { await admin.auth.admin.deleteUser(userA.user.id); });

    const { data: userB, error: ub } = await admin.auth.admin.createUser({
      email: emailB, password: pwd, email_confirm: true,
      user_metadata: { company_id: co2.id, full_name: "Iso B" },
    });
    if (ub) throw new Error(`create userB: ${ub.message}`);
    cleanup.unshift(async () => { await admin.auth.admin.deleteUser(userB.user.id); });

    // Promote both to admin inside their own tenant (handle_new_user gives 'user')
    await admin.from("user_roles").update({ role: "admin" }).eq("user_id", userA.user.id);
    await admin.from("user_roles").update({ role: "admin" }).eq("user_id", userB.user.id);

    // 3. Seed one supplier in each company (using admin client → bypasses RLS, real seed)
    const { data: supA, error: sa } = await admin.from("suppliers").insert({
      name: `__iso_sup_A_${stamp}`, company_id: co1.id
    }).select("id").single();
    if (sa) throw new Error(`seed supplierA: ${sa.message}`);

    const { data: supB, error: sb } = await admin.from("suppliers").insert({
      name: `__iso_sup_B_${stamp}`, company_id: co2.id
    }).select("id").single();
    if (sb) throw new Error(`seed supplierB: ${sb.message}`);

    // 4. Sign in as userA and probe
    const clientA = createClient(supabaseUrl, anonKey);
    const { error: loginAErr } = await clientA.auth.signInWithPassword({ email: emailA, password: pwd });
    if (loginAErr) throw new Error(`login A: ${loginAErr.message}`);

    const { data: aSeesAll } = await clientA.from("suppliers").select("id, name, company_id");
    const aSeesB = (aSeesAll ?? []).some(s => s.id === supB.id);
    const aSeesA = (aSeesAll ?? []).some(s => s.id === supA.id);
    results.push({ name: "userA sees own supplier", passed: aSeesA });
    results.push({
      name: "userA does NOT see B's supplier",
      passed: !aSeesB,
      detail: aSeesB ? `LEAK: A sees ${supB.id}` : undefined,
    });

    // Try to read B's supplier directly
    const { data: directB } = await clientA.from("suppliers").select("id").eq("id", supB.id).maybeSingle();
    results.push({
      name: "userA cannot read B's supplier by id",
      passed: directB == null,
      detail: directB ? "LEAK: direct id access succeeded" : undefined,
    });

    // Try to insert into B's company explicitly
    const { error: insertLeakErr } = await clientA.from("suppliers").insert({
      name: `__iso_attack_${stamp}`, company_id: co2.id
    });
    results.push({
      name: "userA cannot insert into B's company",
      passed: insertLeakErr != null,
      detail: insertLeakErr ? `BLOCKED: ${insertLeakErr.code}` : "LEAK: insert succeeded",
    });

    // Try to update B's supplier
    const { error: updErr, data: updData } = await clientA.from("suppliers")
      .update({ name: "hacked" }).eq("id", supB.id).select();
    const updateBlocked = updErr != null || (updData?.length ?? 0) === 0;
    results.push({
      name: "userA cannot update B's supplier",
      passed: updateBlocked,
      detail: !updateBlocked ? "LEAK: update succeeded" : undefined,
    });

    // 5. Same probes from userB
    const clientB = createClient(supabaseUrl, anonKey);
    const { error: loginBErr } = await clientB.auth.signInWithPassword({ email: emailB, password: pwd });
    if (loginBErr) throw new Error(`login B: ${loginBErr.message}`);

    const { data: bSeesAll } = await clientB.from("suppliers").select("id");
    const bSeesA = (bSeesAll ?? []).some(s => s.id === supA.id);
    const bSeesB = (bSeesAll ?? []).some(s => s.id === supB.id);
    results.push({ name: "userB sees own supplier", passed: bSeesB });
    results.push({
      name: "userB does NOT see A's supplier",
      passed: !bSeesA,
      detail: bSeesA ? `LEAK: B sees ${supA.id}` : undefined,
    });

    // 6. Cleanup (in reverse order; suppliers cascade with company delete? safer to clean explicitly)
    await admin.from("suppliers").delete().in("id", [supA.id, supB.id]);
    for (const fn of cleanup) {
      try { await fn(); } catch (e) { console.warn("cleanup error:", e); }
    }

    const allPassed = results.every(r => r.passed);
    return jsonResponse({
      passed: allPassed,
      summary: `${results.filter(r => r.passed).length}/${results.length} passed`,
      results,
    }, allPassed ? 200 : 200);

  } catch (err) {
    return errorResponse(err);
  }
});
