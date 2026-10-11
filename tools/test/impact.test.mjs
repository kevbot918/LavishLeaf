// Making a Difference totals (netlify/functions/impact.mjs).   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler, { DEFAULT_STATS, cleanStats, setStoreForTests } from '../../netlify/functions/impact.mjs';

function memStore() { const m = new Map(); return { async get(k) { return m.has(k) ? JSON.parse(m.get(k)) : null; }, async setJSON(k, v) { m.set(k, JSON.stringify(v)); } }; }

test('stats are cleaned: no markup, sane numbers, a cap on how many', () => {
  const out = cleanStats([{ key: 'a b<', label: '<b>Pounds</b>', value: '1500.7', unit: 'lb', plus: 1 }, { key: '', label: 'x', value: 1 }, { key: 'neg', label: 'Neg', value: -5 }]);
  assert.deepEqual(out, [{ key: 'ab', label: 'bPounds/b', value: 1501, unit: 'lb', plus: true }, { key: 'neg', label: 'Neg', value: 0, unit: '', plus: false }]);
  assert.equal(cleanStats(new Array(30).fill({ key: 'k', label: 'L', value: 1 })).length, 12);
});

test('GET serves the starting figures until the owner saves; POST needs the owner', async () => {
  setStoreForTests(memStore());
  const got = await (await handler(new Request('https://x/.netlify/functions/impact'))).json();
  assert.deepEqual(got, DEFAULT_STATS);
  const post = await handler(new Request('https://x/.netlify/functions/impact', { method: 'POST', body: JSON.stringify({ action: 'save', stats: [] }) }));
  assert.equal(post.status, 403);
  setStoreForTests(null);
});
