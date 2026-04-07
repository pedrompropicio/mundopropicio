interface SessionLike {
  id: string;
  label?: string | null;
  start_time?: string | null;
  sort_order?: number | null;
}

const SESSION_DATE_PREFIX_REGEX = /^\s*\d{1,2}\/\d{1,2}\s*-\s*/;

export function normalizeSessionLabel(label?: string | null) {
  return (label ?? "")
    .replace(SESSION_DATE_PREFIX_REGEX, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function buildSessionKey(session: SessionLike) {
  return `${normalizeSessionLabel(session.label)}|${(session.start_time ?? "").trim()}`;
}

function takeFirstAvailable(candidates: SessionLike[] | undefined, usedIds: Set<string>) {
  return candidates?.find((candidate) => !usedIds.has(candidate.id));
}

export function buildSessionCopyMap(sourceSessions: SessionLike[], targetSessions: SessionLike[]) {
  const targetsBySortOrder = new Map<number, SessionLike[]>();
  const targetsByKey = new Map<string, SessionLike[]>();
  const targetsByStartTime = new Map<string, SessionLike[]>();

  targetSessions.forEach((session) => {
    if (typeof session.sort_order === "number") {
      const current = targetsBySortOrder.get(session.sort_order) ?? [];
      current.push(session);
      targetsBySortOrder.set(session.sort_order, current);
    }

    const sessionKey = buildSessionKey(session);
    if (sessionKey !== "|") {
      const current = targetsByKey.get(sessionKey) ?? [];
      current.push(session);
      targetsByKey.set(sessionKey, current);
    }

    if (session.start_time) {
      const current = targetsByStartTime.get(session.start_time) ?? [];
      current.push(session);
      targetsByStartTime.set(session.start_time, current);
    }
  });

  const usedTargetIds = new Set<string>();
  const sessionMap = new Map<string, string>();

  sourceSessions.forEach((session) => {
    let match =
      typeof session.sort_order === "number"
        ? takeFirstAvailable(targetsBySortOrder.get(session.sort_order), usedTargetIds)
        : undefined;

    if (!match) {
      const sessionKey = buildSessionKey(session);
      if (sessionKey !== "|") {
        match = takeFirstAvailable(targetsByKey.get(sessionKey), usedTargetIds);
      }
    }

    if (!match && session.start_time) {
      match = takeFirstAvailable(targetsByStartTime.get(session.start_time), usedTargetIds);
    }

    if (!match) {
      const normalizedLabel = normalizeSessionLabel(session.label);
      match = takeFirstAvailable(
        targetSessions.filter((candidate) => normalizeSessionLabel(candidate.label) === normalizedLabel),
        usedTargetIds,
      );
    }

    if (match) {
      usedTargetIds.add(match.id);
      sessionMap.set(session.id, match.id);
    }
  });

  return sessionMap;
}