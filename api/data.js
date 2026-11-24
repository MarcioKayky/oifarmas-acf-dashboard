// Função da Vercel: lê a planilha do Google (planilha pública ou conta de serviço),
// calcula os totais e devolve JSON. O resultado fica em cache por 5 minutos.
const crypto = require('crypto');
const { compute } = require('../lib/compute');
const jedu = require('../lib/jedu.json');

const SHEET_ID = process.env.SHEET_ID || '1mHViniJy8IOIgbac2XPwG2fo1aI_-0IV6HtV8iW5ii4';
const RANGES = ["'Lista completa de cadastros'!A1:F20000"];

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

// Modo público: a planilha precisa estar com "qualquer pessoa com o link: leitor".
// Não usa chave nenhuma. Só é usado quando GOOGLE_SERVICE_ACCOUNT_JSON não existe.
function csv(texto) {
  const linhas = [];
  let linha = [];
  let cel = '';
  let aspas = false;
  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { cel += '"'; i += 1; }
      else if (c === '"') aspas = false;
      else cel += c;
    } else if (c === '"') aspas = true;
    else if (c === ',') { linha.push(cel); cel = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i += 1;
      linha.push(cel); linhas.push(linha); linha = []; cel = '';
    } else cel += c;
  }
  if (cel !== '' || linha.length) { linha.push(cel); linhas.push(linha); }
  return linhas;
}

async function lerPublico(aba) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(aba)}`;
  const r = await fetch(url);
  const t = await r.text();
  if (!r.ok || t.trim().startsWith('<')) {
    throw new Error(`Não consegui ler a aba "${aba}". A planilha está compartilhada como "qualquer pessoa com o link"?`);
  }
  return csv(t);
}

async function lerPrivado() {
  const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const token = await accessToken(sa);
  const qs = RANGES.map((r) => `ranges=${encodeURIComponent(r)}`).join('&');
  const r = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchGet?${qs}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const j = await r.json();
  if (!r.ok) throw new Error(`Google Sheets respondeu ${r.status}: ${(j.error && j.error.message) || ''}`);
  return j.valueRanges[0].values || [];
}

module.exports = async (req, res) => {
  try {
    const leads = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
      ? await lerPrivado()
      : await lerPublico('Lista completa de cadastros');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).json(compute(leads, jedu, new Date()));
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(500).json({ erro: String(e.message || e) });
  }
};
