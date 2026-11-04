import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  findAuthUserByEmail,
  type AuthUserLike,
  type ListUsersPage,
} from "../../supabase/functions/_shared/find-auth-user-by-email";

function directory(size = 2500) {
  const users: AuthUserLike[] = Array.from({ length: size }, (_, index) => ({
    id: `user-${index + 1}`,
    email: `user-${index + 1}@example.test`,
  }));
  const listUsersPage = vi.fn<ListUsersPage>(async ({ page, perPage }) => ({
    data: { users: users.slice((page - 1) * perPage, page * perPage) },
    error: null,
  }));
  return { users, listUsersPage };
}

describe("#310 — procura paginada de utilizadores Auth", () => {
  it("encontra na terceira página de 2500 utilizadores, normalizando ambos os emails", async () => {
    const { users, listUsersPage } = directory();
    users[2499].email = "  User-2500@Example.Test  ";

    expect(await findAuthUserByEmail(listUsersPage, " USER-2500@EXAMPLE.TEST ")).toEqual({
      user: users[2499], pagesRead: 3, truncated: false,
    });
    expect(listUsersPage.mock.calls).toEqual([
      [{ page: 1, perPage: 1000 }],
      [{ page: 2, perPage: 1000 }],
      [{ page: 3, perPage: 1000 }],
    ]);
  });

  it("pára na primeira página quando encontra o alvo", async () => {
    const { users, listUsersPage } = directory();

    expect(await findAuthUserByEmail(listUsersPage, users[50].email!)).toEqual({
      user: users[50], pagesRead: 1, truncated: false,
    });
    expect(listUsersPage.mock.calls).toEqual([[{ page: 1, perPage: 1000 }]]);
  });

  it("pára na terceira página curta quando o email não existe", async () => {
    const { listUsersPage } = directory();

    expect(await findAuthUserByEmail(listUsersPage, "missing@example.test")).toEqual({
      user: null, pagesRead: 3, truncated: false,
    });
    expect(listUsersPage).toHaveBeenCalledTimes(3);
  });

  it("limita a leitura a 20 das 25 páginas cheias e indica truncagem", async () => {
    const { listUsersPage } = directory(25000);

    expect(await findAuthUserByEmail(listUsersPage, "user-25000@example.test")).toEqual({
      user: null, pagesRead: 20, truncated: true,
    });
    expect(listUsersPage.mock.calls).toEqual(
      Array.from({ length: 20 }, (_, index) => [{ page: index + 1, perPage: 1000 }]),
    );
  });

  it("rejeita com a mensagem do erro na segunda página sem ler a terceira", async () => {
    const { users, listUsersPage } = directory();
    listUsersPage
      .mockResolvedValueOnce({ data: { users: users.slice(0, 1000) }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "Auth unavailable" } });

    await expect(findAuthUserByEmail(listUsersPage, "missing@example.test"))
      .rejects.toThrow("Auth unavailable");
    expect(listUsersPage).toHaveBeenCalledTimes(2);
  });

  it.each(["", " \t\n "])("não consulta a API com email vazio: %j", async (email) => {
    const { listUsersPage } = directory();

    expect(await findAuthUserByEmail(listUsersPage, email)).toEqual({
      user: null, pagesRead: 0, truncated: false,
    });
    expect(listUsersPage).not.toHaveBeenCalled();
  });

  it("respeita perPage e maxPages personalizados", async () => {
    const { listUsersPage } = directory();

    expect(await findAuthUserByEmail(listUsersPage, "missing@example.test", {
      perPage: 2, maxPages: 3,
    })).toEqual({ user: null, pagesRead: 3, truncated: true });
    expect(listUsersPage.mock.calls).toEqual([
      [{ page: 1, perPage: 2 }],
      [{ page: 2, perPage: 2 }],
      [{ page: 3, perPage: 2 }],
    ]);
  });

  it("não indica truncagem se encontra o alvo na última página permitida", async () => {
    const { users, listUsersPage } = directory(20000);

    expect(await findAuthUserByEmail(listUsersPage, "user-20000@example.test")).toEqual({
      user: users[19999], pagesRead: 20, truncated: false,
    });
    expect(listUsersPage).toHaveBeenCalledTimes(20);
  });

  it("não indica truncagem quando a última página permitida é curta", async () => {
    const { listUsersPage } = directory();

    expect(await findAuthUserByEmail(listUsersPage, "missing@example.test", { maxPages: 3 }))
      .toEqual({ user: null, pagesRead: 3, truncated: false });
    expect(listUsersPage).toHaveBeenCalledTimes(3);
  });

  it("confirma o fim com uma página vazia após uma página cheia", async () => {
    const { listUsersPage } = directory(1000);

    expect(await findAuthUserByEmail(listUsersPage, "missing@example.test")).toEqual({
      user: null, pagesRead: 2, truncated: false,
    });
    expect(listUsersPage).toHaveBeenCalledTimes(2);
  });

  it("ignora utilizadores sem email e trata data null como página vazia", async () => {
    const listUsersPage = vi.fn<ListUsersPage>()
      .mockResolvedValueOnce({ data: { users: [{ id: "one" }, { id: "two", email: null }] }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    expect(await findAuthUserByEmail(listUsersPage, "missing@example.test", { perPage: 2 }))
      .toEqual({ user: null, pagesRead: 2, truncated: false });
    expect(listUsersPage).toHaveBeenCalledTimes(2);
  });
});

describe("#310 — contrato da fonte de request-password-reset", () => {
  const source = readFileSync("supabase/functions/request-password-reset/index.ts", "utf8");

  it("importa o helper Deno e passa os parâmetros à API sem listUsers() vazio", () => {
    expect(source).toContain('import { findAuthUserByEmail } from "../_shared/find-auth-user-by-email.ts";');
    expect(source).not.toMatch(/\blistUsers\s*\(\s*\)/);
    expect(source).toContain("findAuthUserByEmail((p) => adminClient.auth.admin.listUsers(p), email)");
  });

  it.each([
    ['{ error: "Email é obrigatório" }', 400, 1],
    ['{ error: "Portal inválido" }', 400, 1],
    ["{ success: true }", 200, 3],
    ['{ error: "Erro interno" }', 500, 1],
  ] as const)("preserva o corpo %s e o status %i", (body, status, count) => {
    const response = `JSON.stringify(${body}),\n`;
    const responses = source.split(response).slice(1);
    expect(responses).toHaveLength(count);
    for (const suffix of responses) {
      expect(suffix).toMatch(new RegExp(`^\\s*\\{ status: ${status}, headers:`));
    }
  });

  it("preserva integralmente o signOut global não fatal e o email original de generateLink", () => {
    expect(source).toContain(`    if (targetUser) {
      // Revoke all sessions for this user across all devices
      await adminClient.auth.admin.signOut(targetUser.id, 'global').catch((e: any) =>
        console.warn("signOut global error (non-fatal):", e.message)
      );
    }`);
    expect(source).toContain(`await adminClient.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: portalRedirect },
    })`);
  });
});
