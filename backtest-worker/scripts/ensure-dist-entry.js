const fs = require('fs');
const path = require('path');

const distRoot = path.resolve(__dirname, '..', 'dist');
const targetDir = path.join(distRoot, 'src');
const targetFile = path.join(targetDir, 'main.js');
const sourceRelativePath = "../backtest-worker/src/main.js";

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const content = `#!/usr/bin/env node
try {
  require('${sourceRelativePath}');
} catch (err) {
  if (err && err.code === 'MODULE_NOT_FOUND') {
    console.error('Compiled entry file not found. Did you run "npm run build"?');
  }
  throw err;
}
`;

fs.writeFileSync(targetFile, content, { encoding: 'utf8' });

try {
  fs.chmodSync(targetFile, 0o755);
} catch {
  // ignore chmod failures on non-POSIX systems
}
