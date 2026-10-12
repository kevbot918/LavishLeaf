// Marks the eco-friendly products (owner, 2026-10-11: "We also need more
// eco-friendly and sustainable products"): "eco": true and an "eco" tag in
// products.json, from what the product IS (its material or what it replaces),
// never from a vague claim. The cards show an "Eco" badge (render-store) and
// a search for "eco" finds them all.
//   node tools/eco.mjs    then   node tools/render-store.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'products.json');

export const ECO_WORDS = /\b(compostable|recycled|bamboo|organic|plant-based|reusable|biodegradable|wool|jute|sisal|loofah|loofa|refillable|zero[- ]waste|fair[- ]trade|walnut shell|agave|coir|hemp|beeswax)\b/i;
export const ECO_BRANDS = /^(If You Care|Full Circle|World Centric|Preserve|Repurpose|Casabella Kind)\b/i;

export function isEco(p) {
  if (p.interval) return p.id === 'compost-monthly' || p.id === 'recycle-monthly';
  return ECO_WORDS.test(p.name) || ECO_WORDS.test(p.blurb || '') || ECO_BRANDS.test(p.name);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const data = JSON.parse(readFileSync(FILE, 'utf8'));
  let n = 0;
  for (const p of data.products) {
    if (p.demo) continue;
    const eco = isEco(p);
    if (eco) { p.eco = true; n++; } else delete p.eco;
    p.tags = (p.tags || []).filter((t) => t !== 'eco');
    if (eco) p.tags.push('eco');
  }
  writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
  console.log(`${n} eco-friendly products marked.`);
}
