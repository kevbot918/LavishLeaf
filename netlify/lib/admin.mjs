// The owner, and only the owner, for the dashboard and the newsletter sender
// (2026-10-02, docs/DASHBOARD.md).
//
// The owner signs in with the same Netlify Identity sign-in as the store.
// Two ways to be the owner, either is enough:
//   * the role "admin" on the user in Netlify (Identity -> the user -> Edit
//     roles), or
//   * the address in ADMIN_EMAILS (Netlify environment; several may be given,
//     separated by commas). Kept out of this public repository.
import { userFromRequest } from './identity.mjs';

export function isAdmin(user, env = process.env) {
  if (!user) return false;
  // "admin" in any capitals: Netlify's role box keeps what was typed.
  if (Array.isArray(user.roles) && user.roles.some((r) => String(r).toLowerCase() === 'admin')) return true;
  const list = String(env.ADMIN_EMAILS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  return !!user.email && list.includes(user.email.toLowerCase());
}

/** The signed-in owner, or null. */
export async function adminFromRequest(request, env = process.env, fetchImpl = fetch) {
  const user = await userFromRequest(request, fetchImpl);
  return isAdmin(user, env) ? user : null;
}

export const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
