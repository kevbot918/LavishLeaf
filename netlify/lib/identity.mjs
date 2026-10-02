// Who is signed in, for a modern (Request/Response) Netlify function.
//
// Customer accounts use Netlify Identity (docs/ACCOUNTS.md). The browser
// sends the customer's Identity token as "Authorization: Bearer ...". Rather
// than verify the token's signature here (its secret is Netlify's, not
// ours), this asks Netlify Identity itself who the token belongs to: its
// /user endpoint answers only for a valid, unexpired token.
//
// No token, a bad token, or Identity switched off all mean the same thing:
// a guest. Nothing a guest does depends on being signed in.

export async function userFromRequest(request, fetchImpl = fetch) {
  const auth = request.headers.get('authorization') || '';
  if (!/^Bearer [A-Za-z0-9._~+/=-]{20,4096}$/.test(auth)) return null;
  try {
    const origin = new URL(request.url).origin;
    const res = await fetchImpl(`${origin}/.netlify/identity/user`, { headers: { Authorization: auth } });
    if (!res.ok) return null;
    const u = await res.json();
    if (!u || typeof u.id !== 'string' || !/^[0-9a-f-]{8,64}$/i.test(u.id)) return null;
    const roles = u.app_metadata && Array.isArray(u.app_metadata.roles) ? u.app_metadata.roles.filter((r) => typeof r === 'string') : [];
    return { id: u.id, email: typeof u.email === 'string' ? u.email : '', roles };
  } catch {
    return null;
  }
}
