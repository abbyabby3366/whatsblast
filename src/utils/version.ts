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
