const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '../src/lib/sw-dev-bootstrap.ts');
const dest = path.join(__dirname, '../public/vb-dev-boot.js');
const t = fs.readFileSync(src, 'utf8');
const marker = 'export const SW_DEV_BOOTSTRAP = `';
const start = t.indexOf(marker);
if (start < 0) {
  console.error('marker not found');
  process.exit(1);
}
const bodyStart = start + marker.length;
const endMarker = '\n`.trim();';
const end = t.lastIndexOf(endMarker);
if (end <= bodyStart) {
  console.error('end not found', end, bodyStart);
  process.exit(1);
}
const body = t.slice(bodyStart, end).trim();
fs.writeFileSync(dest, body + '\n');
console.log('wrote', dest, body.length, 'chars');
