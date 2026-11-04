export type AuthUserLike = { id: string; email?: string | null };

export type ListUsersPage = (p: { page: number; perPage: number }) => Promise<{
  data: { users: AuthUserLike[] } | null;
  error: { message: string } | null;
}>;

export async function findAuthUserByEmail(
  listUsersPage: ListUsersPage,
  email: string,
  opts?: { perPage?: number; maxPages?: number },
): Promise<{ user: AuthUserLike | null; pagesRead: number; truncated: boolean }> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return { user: null, pagesRead: 0, truncated: false };
  }

  const perPage = opts?.perPage ?? 1000;
  const maxPages = opts?.maxPages ?? 20;
  let pagesRead = 0;

  for (let page = 1; page <= maxPages; page++) {
    const { data, error } = await listUsersPage({ page, perPage });
    if (error) throw new Error(error.message);
    pagesRead++;

    const users = data?.users ?? [];
    const user = users.find((user) => user.email?.trim().toLowerCase() === normalizedEmail);
    if (user) return { user, pagesRead, truncated: false };
    if (users.length < perPage) return { user: null, pagesRead, truncated: false };
  }

  return { user: null, pagesRead, truncated: true };
}
