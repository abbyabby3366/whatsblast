import path from 'path';

export const SESSIONS_DIR = process.env.SESSIONS_DIR || './sessions';

// session_id is used as a filesystem folder name and as a Redis key prefix
// (`wa_session:${id}:*`), so it must not contain path separators, dots or glob characters.
export const SESSION_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidSessionId(id: unknown): id is string {
  return typeof id === 'string' && SESSION_ID_RE.test(id);
}

/** Resolves the on-disk auth folder for a session, or null if the id would escape SESSIONS_DIR. */
export function getSessionFolder(sessionId: string): string | null {
  if (!isValidSessionId(sessionId)) return null;
  const base = path.resolve(SESSIONS_DIR);
  const folder = path.resolve(base, sessionId);
  if (!folder.startsWith(base + path.sep)) return null;
  return folder;
}
