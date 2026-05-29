// build-www.js — Copies web assets into www/ for Capacitor
const fs = require('fs');
const path = require('path');

const www = path.join(__dirname, 'www');

// Clean www/
if (fs.existsSync(www)) {
  fs.rmSync(www, { recursive: true, force: true });
}
fs.mkdirSync(www, { recursive: true });

// Files to copy
const files = [
  'index.html',
  'guide.html',
  'manifest.json',
  'sw.js',
];

// Directories to copy (recursively)
const dirs = [
  'css',
  'js',
  'icons',
];

// Copy individual files
for (const f of files) {
  const src = path.join(__dirname, f);
  const dst = path.join(www, f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    console.log(`  ✓ ${f}`);
  } else {
    console.log(`  ✗ ${f} (not found, skipping)`);
  }
}

// Copy directories recursively
function copyDir(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

for (const d of dirs) {
  const src = path.join(__dirname, d);
  const dst = path.join(www, d);
  if (fs.existsSync(src)) {
    copyDir(src, dst);
    const count = fs.readdirSync(src, { recursive: true }).length;
    console.log(`  ✓ ${d}/ (${count} files)`);
  } else {
    console.log(`  ✗ ${d}/ (not found, skipping)`);
  }
}

console.log(`\n✅ www/ ready for Capacitor sync.`);
