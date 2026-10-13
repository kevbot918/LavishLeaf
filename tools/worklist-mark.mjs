// Marks items in docs/WORKLIST-2026-10-12.md (a session-resume aid).
//   node tools/worklist-mark.mjs 7 "DONE: what was done" 8 "DONE" ...
import fs from 'node:fs';
const F = 'docs/WORKLIST-2026-10-12.md';
let s = fs.readFileSync(F, 'utf8');
const crlf = s.includes('\r\n');
const lines = s.replace(/\r\n/g, '\n').split('\n');
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 2) {
  const n = args[i], status = args[i + 1].replace(/\|/g, '/');
  const k = lines.findIndex((l) => l.startsWith(`| ${n} |`));
  if (k < 0) { console.log('no item', n); continue; }
  lines[k] = lines[k].replace(/\| [^|]*\|\s*$/, `| ${status} |`);
}
s = lines.join('\n');
fs.writeFileSync(F, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('marked', args.length / 2);
