// Netlify Function: subscribe a quiz taker to Kit, server-side.
// The browser can't POST to Kit directly (CORS + spam protection), so the page
// posts { email, level, level_name } here and we call the Kit v4 API with a
// secret key held in the KIT_API_KEY environment variable (never exposed to the page).
//
// We do everything the funnel needs directly, so it does not depend on a Kit "rule"
// firing (adding to a form via the API does not reliably trigger form rules):
//   1. create/update the subscriber with custom fields (quiz_level, quiz_level_name)
//   2. tag them as an AI Magic Wand Quiz lead (source tracking)
//   3. add them to the "AI Magic Wand Quiz — Email 1 (Result)" sequence (sends Email 1)
//   4. add them to the form too, for form analytics

const FORM_ID = '9896212';
const TAG_ID = '23206948';       // "AI Magic Wand Quiz"
const SEQUENCE_ID = '2887342';   // "AI Magic Wand Quiz — Email 1 (Result)"
const JSON_HEADERS = { 'Content-Type': 'application/json' };

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: JSON_HEADERS, body: '' };
  if (event.httpMethod !== 'POST')   return { statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify({ ok:false, error:'method_not_allowed' }) };

  const key = process.env.KIT_API_KEY;
  if (!key) return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ ok:false, error:'missing_api_key' }) };

  let data = {};
  try { data = JSON.parse(event.body || '{}'); } catch (e) {}
  const email = String(data.email || '').trim();
  const level = String(data.level == null ? '' : data.level).trim();
  const levelName = String(data.level_name || '').trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[0-5]$/.test(level)) {
    return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ ok:false, error:'bad_input' }) };
  }

  const H = { 'X-Kit-Api-Key': key, 'Content-Type': 'application/json', 'Accept': 'application/json' };
  const post = (url, payload) => fetch(url, { method:'POST', headers:H, body: JSON.stringify(payload) });

  try {
    // 1) create/update subscriber with the quiz custom fields (must be set before Email 1 sends)
    const r1 = await post('https://api.kit.com/v4/subscribers', {
      email_address: email, fields: { quiz_level: level, quiz_level_name: levelName }
    });
    // 2) source tag
    const r2 = await post('https://api.kit.com/v4/tags/' + TAG_ID + '/subscribers', { email_address: email });
    // 3) enrol in the Email 1 sequence (this delivers the result email)
    const r3 = await post('https://api.kit.com/v4/sequences/' + SEQUENCE_ID + '/subscribers', { email_address: email });
    // 4) add to form for analytics (best effort)
    const r4 = await post('https://api.kit.com/v4/forms/' + FORM_ID + '/subscribers', { email_address: email });

    const ok = r1.ok && r2.ok && r3.ok;   // 1-3 are essential; 4 is best-effort
    let detail = null;
    if (!ok) {
      try { detail = { s1:r1.status, b1:(await r1.text()).slice(0,300), s2:r2.status, b2:(await r2.text()).slice(0,300), s3:r3.status, b3:(await r3.text()).slice(0,300) }; } catch (e) {}
    }
    return { statusCode: ok ? 200 : 502, headers: JSON_HEADERS, body: JSON.stringify({ ok, detail }) };
  } catch (e) {
    return { statusCode: 502, headers: JSON_HEADERS, body: JSON.stringify({ ok:false, error: String(e) }) };
  }
};
