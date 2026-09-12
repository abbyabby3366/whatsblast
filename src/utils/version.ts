import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Resolves the application version dynamically from client/src/lib/version.ts,
 * which serves as the single source of truth for version bumps across the app.
 */
export function getAppVersion(): string {
  if (process.env.APP_VERSION) {
    return process.env.APP_VERSION;
  }

  const candidatePaths = [
    path.resolve(process.cwd(), 'client/src/lib/version.ts'),
    path.resolve(__dirname, '../../client/src/lib/version.ts'),
    path.resolve(process.cwd(), 'version.ts'),
  ];

  for (const filePath of candidatePaths) {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        const match = content.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
        if (match && match[1]) {
          return match[1];
        }
      }
    } catch {
      // Continue searching next candidate path
    }
  }

  return 'v1.12';
}

/**
 * Retrieves the latest git commit message.
 * Checks build-time artifact dist/git-info.json (works in Docker/production runner without .git),
 * then falls back to git log CLI directly, then environment variables.
 */
export function getLatestCommitMessage(): string | null {
  const candidateJsonPaths = [
    path.resolve(process.cwd(), 'dist/git-info.json'),
    path.resolve(__dirname, '../git-info.json'),
    path.resolve(process.cwd(), 'git-info.json'),
  ];

  for (const jsonPath of candidateJsonPaths) {
    try {
      if (fs.existsSync(jsonPath)) {
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        if (data.message) {
          return data.message.trim();
        }
      }
    } catch {
      // Continue searching next candidate path
    }
  }

  try {
    const msg = execSync('git log -1 --pretty=%s', {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (msg) return msg;
  } catch {
    // Git command failed or repository metadata unavailable
  }

  if (process.env.RENDER_GIT_COMMIT_MESSAGE) {
    return process.env.RENDER_GIT_COMMIT_MESSAGE.trim();
  }

  if (process.env.COMMIT_MESSAGE) {
    return process.env.COMMIT_MESSAGE.trim();
  }

  return null;
}
