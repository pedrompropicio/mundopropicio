/** Build-only metadata. Accept full SHA-1 or SHA-256 object IDs, never refs. */
export function resolveBuildCommit(
  readGit: () => string,
  env: Readonly<Partial<Record<'VITE_COMMIT_SHA' | 'COMMIT_REF' | 'GIT_COMMIT', string>>>,
): { commit: string | null; commitSource: 'git' | 'VITE_COMMIT_SHA' | 'COMMIT_REF' | 'GIT_COMMIT' | 'unknown' } {
  const validate = (value: string | undefined): string | null => {
    const candidate = value?.trim();
    return candidate && /^(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/.test(candidate)
      ? candidate.toLowerCase()
      : null;
  };
  try {
    const commit = validate(readGit());
    if (commit) return { commit, commitSource: 'git' };
  } catch {
    // Missing git/repository is expected in some builders. Do not log raw errors.
  }
  for (const source of ['VITE_COMMIT_SHA', 'COMMIT_REF', 'GIT_COMMIT'] as const) {
    const commit = validate(env[source]);
    if (commit) return { commit, commitSource: source };
  }
  return { commit: null, commitSource: 'unknown' };
}
