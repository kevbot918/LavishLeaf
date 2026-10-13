// Netlify calls a function by this exact name when somebody creates an
// account (after they confirm their email). Owner, 2026-10-13: every new
// account gets our own welcome email, is counted for the dashboard and kept
// as a contact (lib/account-welcome.mjs; account.mjs does the same on the
// first sign-in, so whichever runs first does it once).
//
// Modern (Request/Response) format: Lambda-style functions broke every deploy
// once the site's environment variables passed AWS Lambda's 4 KB limit.
// Always answers 204: anything else would block the sign-up.
import { welcomeAccount } from '../lib/account-welcome.mjs';

export default async (request) => {
  try {
    const body = await request.json();
    const user = (body && body.user) || {};
    await welcomeAccount({ id: user.id, email: user.email, name: user.user_metadata && user.user_metadata.full_name });
  } catch (e) {
    console.error('[identity-signup]', e.message);
  }
  return new Response(null, { status: 204 });
};
