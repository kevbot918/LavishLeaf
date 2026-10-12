// When a registration's payment is captured: mark it paid and email the owner
// every player's name, phone and email (2026-10-12). Once per order; never
// fails the payment, which has already gone through.
import { registrationsStore } from './registrations.mjs';
import { esc, mailConfig, sendEmail, textOf, validEmail } from './mail.mjs';

const phone = (p) => String(p).replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');

export function rosterRows(r) {
  const people = r.kind === 'team' ? [{ role: 'Captain', ...r.captain }, ...r.players.map((p) => ({ role: 'Player', ...p }))] : [{ role: 'Player', name: r.name, phone: r.phone, email: r.email }];
  return people.map((p) => [p.role, p.name, phone(p.phone), p.email]);
}

export async function registrationsPaid(orderId, payer = {}) {
  try {
    const store = await registrationsStore();
    const key = 'o-' + orderId;
    const rec = await store.get(key, { type: 'json' });
    if (!rec) return null;
    rec.status = 'paid';
    rec.paid = rec.paid || new Date().toISOString();
    rec.payerEmail = String((payer && payer.email_address) || '').toLowerCase();
    if (!rec.alerted) {
      const owner = mailConfig().owner;
      if (validEmail(owner)) {
        const blocks = rec.regs.map((r) => `<p><strong>${esc(r.productName)}</strong>${r.kind === 'team' ? ': team <strong>' + esc(r.team) + '</strong>' : r.team ? ', joining ' + esc(r.team) : ''}</p><table>${rosterRows(r).map((row) => `<tr>${row.map((c) => `<td style="padding:2px 12px 2px 0">${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`).join('');
        const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#222"><p><strong>New league registration</strong>, PayPal order ${esc(orderId)}</p>${blocks}<p>All accepted league communication and playing in both Eufaula and McAlester${rec.waivers && rec.waivers.length ? ', and the liability waiver (' + esc(rec.waivers.join(', ')) + ')' : ''}. Paid by ${esc(rec.payerEmail || 'PayPal')}. Every registration is in the dashboard.</p></div>`;
        const who = rec.regs.map((r) => (r.kind === 'team' ? 'Team ' + r.team : r.name)).join(', ');
        await sendEmail({ to: owner, subject: `New registration: ${who}`.slice(0, 120), html, text: textOf(html), kind: 'owner' });
      }
      rec.alerted = new Date().toISOString();
    }
    await store.setJSON(key, rec);
    return rec;
  } catch (e) {
    console.error('[registrations] after payment', e.message);
    return null;
  }
}
