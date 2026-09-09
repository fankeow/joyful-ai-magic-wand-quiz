// Netlify Function: subscribe a quiz taker to Kit, server-side.
// The browser can't POST to Kit directly (CORS + spam protection), so the page
// posts { email, level, level_name } here and we call the Kit v4 API with a
// secret key held in the KIT_API_KEY environment variable (never exposed to the page).
//
// Flow: set the subscriber's custom fields (quiz_level, quiz_level_name), then add
// them to the "AI Magic Wand Quiz" form, which fires the Kit rule that sends Email 1.

const FORM_ID = '9896212';
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

  const kitHeaders = { 'X-Kit-Api-Key': key, 'Content-Type': 'application/json', 'Accept': 'application/json' };

  try {
    // 1) Create or update the subscriber with the quiz custom fields.
    const r1 = await fetch('https://api.kit.com/v4/subscribers', {
      method: 'POST',
      headers: kitHeaders,
      body: JSON.stringify({ email_address: email, fields: { quiz_level: level, quiz_level_name: levelName } })
    });

    // 2) Add them to the form (fires the rule that sends Email 1 and tags them).
    const r2 = await fetch('https://api.kit.com/v4/forms/' + FORM_ID + '/subscribers', {
      method: 'POST',
      headers: kitHeaders,
      body: JSON.stringify({ email_address: email })
    });

    const ok = r1.ok && r2.ok;
    let detail = null;
    if (!ok) { try { detail = { s1: r1.status, b1: await r1.text(), s2: r2.status, b2: await r2.text() }; } catch (e) {} }
    return { statusCode: ok ? 200 : 502, headers: JSON_HEADERS, body: JSON.stringify({ ok, detail }) };
  } catch (e) {
    return { statusCode: 502, headers: JSON_HEADERS, body: JSON.stringify({ ok:false, error: String(e) }) };
  }
};
