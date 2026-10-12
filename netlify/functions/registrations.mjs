// POST /.netlify/functions/registrations  { action: "list" }   owner only
//   -> { registrations: [...] }  every league registration, newest first
// (netlify/lib/registrations.mjs; written by checkout, marked paid by capture)
import { adminFromRequest, json } from '../lib/admin.mjs';
import { registrationsStore } from '../lib/registrations.mjs';

export default async (request) => {
  if (request.method !== 'POST') return json(405, { error: 'POST only.' });
  if (!(await adminFromRequest(request))) return json(403, { error: 'Owner only.' });
  let body = {};
  try { body = await request.json(); } catch { /* below */ }
  if (body.action !== 'list') return json(400, { error: 'Unknown action.' });
  const store = await registrationsStore();
  const { blobs } = await store.list({ prefix: 'o-' });
  const out = [];
  for (const b of blobs) { const r = await store.get(b.key, { type: 'json' }); if (r) out.push(r); }
  out.sort((a, b) => String(b.created).localeCompare(String(a.created)));
  return json(200, { registrations: out });
};
