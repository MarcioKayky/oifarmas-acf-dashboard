// Função da Vercel: lê a planilha do Google (conta de serviço, só leitura),
// calcula os totais e devolve JSON. O resultado fica em cache por 5 minutos.
const crypto = require('crypto');
const { compute } = require('../lib/compute');

const SHEET_ID = process.env.SHEET_ID || '1mHViniJy8IOIgbac2XPwG2fo1aI_-0IV6HtV8iW5ii4';
const RANGES = [
  "'Lista completa de cadastros'!A1:F20000",
  "'Categoria 2'!A1:C3000",
  "'Categoria 3'!A1:C3000",
];

const b64url = (b) => Buffer.from(b).toString('base64').replace(/=/g, '').replace(/[+]/g, '-').replace(/[/]/g, '_');

async function accessToken(sa) {
  const agora = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: agora,
    exp: agora + 3600,
  }));
  const assinatura = crypto.createSign('RSA-SHA256')
    .update(`${head}.${claim}`)
    .sign(String(sa.private_key).replace(/\\n/g, '\n'));
  const jwt = `${head}.${claim}.${b64url(assinatura)}`;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Login no Google falhou: ${j.error_description || j.error || r.status}`);
  return j.access_token;
}

module.exports = async (req, res) => {
  try {
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      throw new Error('Falta a variável de ambiente GOOGLE_SERVICE_ACCOUNT_JSON.');
    }
    const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const token = await accessToken(sa);
    const qs = RANGES.map((r) => `ranges=${encodeURIComponent(r)}`).join('&');
    const r = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchGet?${qs}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const j = await r.json();
    if (!r.ok) throw new Error(`Google Sheets respondeu ${r.status}: ${(j.error && j.error.message) || ''}`);
    const [leads, cat2, cat3] = j.valueRanges.map((v) => v.values || []);
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).json(compute(leads, cat2, cat3, new Date()));
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(500).json({ erro: String(e.message || e) });
  }
};
