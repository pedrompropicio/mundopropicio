import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  findAuthUserByEmail,
  type AuthUserLike,
  type ListUsersPage,
} from "../../supabase/functions/_shared/find-auth-user-by-email";

function directory(size = 2500) {
  const users: (AuthUserLike & { user_metadata: { full_name: string } })[] = Array.from(
    { length: size },
    (_, index) => ({
      id: `user-${index + 1}`,
      email: `user-${index + 1}@example.test`,
      user_metadata: { full_name: `User ${index + 1}` },
    }),
  );
  const listUsersPage = vi.fn<ListUsersPage>(async ({ page, perPage }) => ({
    data: { users: users.slice((page - 1) * perPage, page * perPage) },
    error: null,
  }));
  const adminClient = { auth: { admin: { listUsers: listUsersPage } } };
  return { users, listUsersPage, adminClient };
}

describe("#607 — create-user com a mesma lambda para o helper partilhado", () => {
  it("encontra na terceira página o mesmo objecto e os seus metadados, normalizando o email", async () => {
    const { users, listUsersPage, adminClient } = directory();

    const result = await findAuthUserByEmail(
      (p) => adminClient.auth.admin.listUsers(p), "  User-2500@Example.Test ",
    );

    expect(result).toEqual({ user: users[2499], pagesRead: 3, truncated: false });
    expect(result.user).toBe(users[2499]);
    expect(result.user).toHaveProperty("user_metadata.full_name", "User 2500");
    expect(listUsersPage.mock.calls).toEqual([
      [{ page: 1, perPage: 1000 }],
      [{ page: 2, perPage: 1000 }],
      [{ page: 3, perPage: 1000 }],
    ]);
  });

  it("devolve null após três páginas quando o email está ausente", async () => {
    const { listUsersPage, adminClient } = directory();

    expect(await findAuthUserByEmail(
      (p) => adminClient.auth.admin.listUsers(p), "missing@example.test",
    )).toEqual({ user: null, pagesRead: 3, truncated: false });
    expect(listUsersPage).toHaveBeenCalledTimes(3);
  });

  it("rejeita com a mesma mensagem na segunda página e não lê a terceira", async () => {
    const { users, listUsersPage, adminClient } = directory();
    listUsersPage
      .mockResolvedValueOnce({ data: { users: users.slice(0, 1000) }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "Auth unavailable" } });

    await expect(findAuthUserByEmail(
      (p) => adminClient.auth.admin.listUsers(p), "missing@example.test",
    )).rejects.toHaveProperty("message", "Auth unavailable");
    expect(listUsersPage.mock.calls).toEqual([
      [{ page: 1, perPage: 1000 }],
      [{ page: 2, perPage: 1000 }],
    ]);
  });

  it("devolve null com truncagem ao atingir o limite de 20 páginas", async () => {
    const { listUsersPage, adminClient } = directory(25000);

    expect(await findAuthUserByEmail(
      (p) => adminClient.auth.admin.listUsers(p), "user-25000@example.test",
    )).toEqual({ user: null, pagesRead: 20, truncated: true });
    expect(listUsersPage.mock.calls).toEqual(
      Array.from({ length: 20 }, (_, index) => [{ page: index + 1, perPage: 1000 }]),
    );
  });
});

describe("#607 — contrato da fonte de create-user", () => {
  const source = readFileSync("supabase/functions/create-user/index.ts", "utf8");
  const helperImport = 'import { findAuthUserByEmail } from "../_shared/find-auth-user-by-email.ts";';
  const helperStart = source.indexOf("async function findExistingAuthUser");
  const nextFunctionStart = source.indexOf("async function attachUserToCompany");
  const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

  it("importa na quarta linha e delega a paginação pela lambda exacta", () => {
    expect(source.split("\n")[3]).toBe(helperImport);
    expect(source).toContain(
      "const { user, truncated } = await findAuthUserByEmail((p) => adminClient.auth.admin.listUsers(p), email);",
    );
    expect(source).not.toContain("listUsers({ page: 1");
    expect(source).not.toMatch(/\blistUsers\s*\(\s*\)/);
  });

  it("mantém a assinatura, avisa sem falhar na truncagem e converte null em undefined", () => {
    expect(source.slice(helperStart, nextFunctionStart)).toBe(`async function findExistingAuthUser(adminClient: any, email: string) {
  const { user, truncated } = await findAuthUserByEmail((p) => adminClient.auth.admin.listUsers(p), email);
  if (truncated) console.warn("listUsers truncated (non-fatal): maximum pages reached");
  return (user ?? undefined) as { id: string; email?: string | null; user_metadata?: any } | undefined;
}

`);
  });

  it("preserva os hashes das duas regiões fora da alteração autorizada", () => {
    const prefix = source.slice(0, helperStart).replace(`${helperImport}\n`, "");

    expect(sha256(prefix)).toBe("72b0dd0ed027cc154c72fe6555deb1e77fbf0c066478fedd42d756a119290189");
    expect(sha256(source.slice(nextFunctionStart)))
      .toBe("cb759537394918b678c0e01976aa3c4f53e9d05252242cbe6752d723367e7d74");
  });

  it("conserva as 17 respostas, o HTTP 200 e o catch com a mensagem original", () => {
    expect(source.match(/respond\(\{/g)).toHaveLength(17);
    expect(source).toContain(`function respond(payload: RespondPayload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}`);
    expect(source).toContain(`  } catch (err) {
    return respond({
      error: err instanceof Error ? err.message : "Erro interno ao criar utilizador",
      diagnostics: { stage: "unexpected" },
    });
  }`);
  });
});
