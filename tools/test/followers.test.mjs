// Follower growth from the daily readings (netlify/lib/dashboard.mjs).
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { followerGrowth, recordFollowers } from '../../netlify/lib/dashboard.mjs';

const day = (s) => Date.parse(s + 'T12:00:00Z');
const reading = (fb, ig) => ({ facebook: { followers: fb }, instagram: { followers: ig } });

test('one reading a day, the latest of the day kept', () => {
  let h = recordFollowers([], reading(100, 50), day('2026-10-01'));
  h = recordFollowers(h, reading(101, 51), day('2026-10-01'));
  assert.deepEqual(h, [{ date: '2026-10-01', fb: 101, ig: 51 }]);
  h = recordFollowers(h, null, day('2026-10-02'));
  assert.equal(h.length, 1, 'nothing read, nothing written');
});

test('growth over the period, and over the history when it is younger', () => {
  let h = [];
  for (const [d, fb, ig] of [['2026-09-01', 80, 40], ['2026-10-01', 100, 50], ['2026-10-05', 105, 52], ['2026-10-10', 110, 60]]) h = recordFollowers(h, reading(fb, ig), day(d));
  const g7 = followerGrowth(h, 7, day('2026-10-10'));
  assert.deepEqual([g7.facebook, g7.instagram, g7.complete, g7.from], [10, 10, true, '2026-10-01']);
  const g28 = followerGrowth(h, 28, day('2026-10-10'));
  assert.deepEqual([g28.facebook, g28.complete, g28.from], [30, true, '2026-09-01']);
  const g90 = followerGrowth(h, 90, day('2026-10-10'));
  assert.deepEqual([g90.facebook, g90.complete, g90.from], [30, false, '2026-09-01']);
  assert.equal(followerGrowth([], 7), null);
});
