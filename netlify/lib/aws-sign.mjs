// AWS Signature Version 4, just enough to call Amazon SES from a Netlify
// function without the AWS SDK (2026-10-07, the owner chose Amazon SES over
// Brevo for email). Tested against AWS's own published example in
// tools/test/email-ses.test.mjs.
import { createHash, createHmac } from 'node:crypto';

const sha256hex = (data) => createHash('sha256').update(data, 'utf8').digest('hex');
const hmac = (key, data) => createHmac('sha256', key).update(data, 'utf8').digest();

/** "20261007T153000Z" and "20261007" for a Date. */
export function amzDates(date = new Date()) {
  const iso = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

/**
 * Sign one request. Returns the headers to send (the given ones plus
 * x-amz-date and Authorization). path must already be URI-encoded; query is
 * a canonical query string ("" for none).
 */
export function signV4({ method, host, path, query = '', headers = {}, body = '', service, region, accessKeyId, secretAccessKey, date = new Date() }) {
  const { amzDate, dateStamp } = amzDates(date);
  const all = { ...headers, host, 'x-amz-date': amzDate };
  const names = Object.keys(all).map((k) => k.toLowerCase()).sort();
  const lower = {};
  for (const [k, v] of Object.entries(all)) lower[k.toLowerCase()] = String(v).trim().replace(/\s+/g, ' ');
  const canonicalHeaders = names.map((k) => `${k}:${lower[k]}\n`).join('');
  const signedHeaders = names.join(';');
  const canonical = [method, path, query, canonicalHeaders, signedHeaders, sha256hex(body)].join('\n');
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonical)].join('\n');
  const kDate = hmac('AWS4' + secretAccessKey, dateStamp);
  const kSigning = hmac(hmac(hmac(kDate, region), service), 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(toSign, 'utf8').digest('hex');
  return {
    ...headers,
    'x-amz-date': amzDate,
    Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}
