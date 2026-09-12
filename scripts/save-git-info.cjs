const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

try {
  const message = execSync('git log -1 --pretty=%s', { encoding: 'utf8' }).trim();
  const hash = execSync('git log -1 --pretty=%h', { encoding: 'utf8' }).trim();
  const outDir = path.resolve(process.cwd(), 'dist');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(outDir, 'git-info.json'),
    JSON.stringify({ message, hash }, null, 2),
    'utf8'
  );
  console.log(`✅ Saved git info to dist/git-info.json: "${message}" (${hash})`);
} catch (err) {
  console.log('ℹ️ Git info could not be retrieved at build time:', err.message);
}
