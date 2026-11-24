// Calcula todos os números do dashboard a partir das células da planilha.
// Entrada: células da aba "Lista completa de cadastros" (primeira linha = cabeçalho)
// e os pedidos pagos da Jedu (lib/jedu.json, atualizado à mão).
// Saída: apenas totais (nenhum e-mail ou telefone sai daqui).

const GRUPOS = {
  SP: '11 12 13 14 15 16 17 18 19', RJ: '21 22 24', ES: '27 28', MG: '31 32 33 34 35 37 38',
  PR: '41 42 43 44 45 46', SC: '47 48 49', RS: '51 53 54 55', DF: '61', GO: '62 64', TO: '63',
  MT: '65 66', MS: '67', AC: '68', RO: '69', BA: '71 73 74 75 77', SE: '79', PE: '81 87',
  AL: '82', PB: '83', RN: '84', CE: '85 88', PI: '86 89', PA: '91 93 94', AM: '92 97',
  RR: '95', AP: '96', MA: '98 99',
};
const UF = {};
Object.entries(GRUPOS).forEach(([uf, ds]) => ds.split(' ').forEach((d) => { UF[d] = uf; }));

const TYPOS = ['gmial.com', 'gamil.com', 'gmal.com', 'gmail.con', 'gmail.co', 'hotmial.com',
  'hotmal.com', 'outlok.com', 'yaho.com', 'yahoo.con'];

const norm = (s) => String(s || '').trim().toLowerCase();

function linhas(values) {
  const v = values || [];
  if (!v.length) return [];
  const cols = v[0].map((c) => String(c).trim());
  return v.slice(1)
    .filter((r) => r.some((c) => String(c).trim() !== ''))
    .map((r) => {
      const o = {};
      cols.forEach((c, i) => { o[c] = r[i] == null ? '' : String(r[i]); });
      return o;
    });
}

const nacional = (s) => {
  let d = String(s || '').replace(/[^0-9]/g, '');
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  return d;
};
const telefoneOk = (d) => !!UF[d.slice(0, 2)]
  && ((d.length === 10 && '2345'.includes(d[2])) || (d.length === 11 && d[2] === '9'))
  && new Set(d).size > 1;
const emailOk = (e) => /^[^@ ]+@[^@ ]+[.][a-z]{2,}$/.test(e) && !TYPOS.includes(e.split('@')[1]);

function dataSP(now) {
  // Data de hoje e de ontem no fuso de São Paulo, como AAAA-MM-DD.
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
  const [a, m, d] = hoje.split('-').map(Number);
  const ontem = new Date(Date.UTC(a, m - 1, d - 1)).toISOString().slice(0, 10);
  return { hoje, ontem, rotulo: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}` };
}

function agrupar(lista, campo, base) {
  const g = {};
  lista.forEach((r) => { if (r[campo]) g[r[campo]] = (g[r[campo]] || 0) + 1; });
  return Object.entries(g)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([k, n]) => ({ nome: k, inscritos: n, pct: base ? n / base : 0 }));
}

function compute(leadsValues, jedu, now = new Date()) {
  const leads = linhas(leadsValues);

  // 1. Cadastros enriquecidos
  const base = leads.map((r) => {
    const email = norm(r.EMAIL);
    const tel = nacional(r.TELEFONE);
    const p = String(r['data de cadastro'] || '').trim().split('/');
    const dia = p.length === 3 && p[2].length === 4
      ? `${p[2]}-${p[0].padStart(2, '0')}-${p[1].padStart(2, '0')}` : '';
    const ok = telefoneOk(tel);
    return {
      dia,
      canal: String(r.utm_source || '').trim() || '(sem utm_source)',
      campanha: String(r.utm_campaign || '').trim() || '(sem utm_campaign)',
      uf: ok ? UF[tel.slice(0, 2)] : '',
      email, tel,
      tel_ok: ok ? 1 : 0,
      email_ok: emailOk(email) ? 1 : 0,
      nome_ok: String(r.nome || '').trim().length >= 2 ? 1 : 0,
    };
  });
  const ec = {};
  const pc = {};
  base.forEach((r) => {
    if (r.email) ec[r.email] = (ec[r.email] || 0) + 1;
    if (r.tel_ok) pc[r.tel] = (pc[r.tel] || 0) + 1;
  });
  const cad = base.map((r) => {
    const dup = (r.email && ec[r.email] > 1) || (r.tel_ok && pc[r.tel] > 1) ? 1 : 0;
    const semExNome = r.tel_ok && r.email_ok && !dup ? 1 : 0;
    return { ...r, duplicado: dup, sem_problema_exceto_nome: semExNome, sem_problema: semExNome && r.nome_ok ? 1 : 0 };
  });

  // 2. Vendas pagas na Jedu (Categoria 2 e 3)
  const cats = (jedu && jedu.categorias) || [];
  const pagos = cats.reduce((t, c) => t + c.pagos, 0);

  // 3. Indicadores
  const n = cad.length;
  const sp = dataSP(now);
  const canais = agrupar(cad, 'canal', n);
  const comUf = cad.filter((r) => r.uf).length;
  const dias = new Set(cad.filter((r) => r.dia).map((r) => r.dia));
  const kpis = {
    inscritos: n,
    dias: dias.size,
    pagos,
    conversao: n ? pagos / n : 0,
    processando: cats.reduce((t, c) => t + c.processando, 0),
    lido_em: (jedu && jedu.lido_em) || '',
    hoje: cad.filter((r) => r.dia === sp.hoje).length,
    ontem: cad.filter((r) => r.dia === sp.ontem).length,
    hoje_rotulo: sp.rotulo,
    sem_uf: n - comUf,
    top_canal: canais[0] ? canais[0].nome : '—',
    top_canal_pct: canais[0] ? canais[0].pct : 0,
  };

  // 4. Séries
  const porDia = {};
  cad.forEach((r) => { if (r.dia) porDia[r.dia] = (porDia[r.dia] || 0) + 1; });
  const por_dia = Object.entries(porDia).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([dia, k]) => ({
    dia, rotulo: `${dia.slice(8, 10)}/${dia.slice(5, 7)}`, inscritos: k, pct: n ? k / n : 0,
  }));

  const vendas_categoria = cats.map((c) => ({
    nome: c.nome, pagos: c.pagos, pct: pagos ? c.pagos / pagos : 0,
  }));

  const s = (f) => cad.filter(f).length;
  const sem = s((r) => r.sem_problema);
  const semEx = s((r) => r.sem_problema_exceto_nome);
  const qualidade = {
    total: n,
    sem_problema: sem, pct_sem_problema: n ? sem / n : 0,
    sem_problema_exceto_nome: semEx, pct_exceto_nome: n ? semEx / n : 0,
    tel_invalido: s((r) => !r.tel_ok), email_invalido: s((r) => !r.email_ok),
    sem_nome: s((r) => !r.nome_ok), duplicados: s((r) => r.duplicado),
  };
  const qualidade_itens = [
    { nome: 'Sem nome', cadastros: qualidade.sem_nome },
    { nome: 'Telefone inválido', cadastros: qualidade.tel_invalido },
    { nome: 'Cadastro duplicado', cadastros: qualidade.duplicados },
    { nome: 'E-mail inválido', cadastros: qualidade.email_invalido },
  ].map((x) => ({ ...x, pct: n ? x.cadastros / n : 0 })).sort((a, b) => b.cadastros - a.cadastros);

  return {
    atualizado_em: now.toISOString(),
    kpis,
    por_dia,
    por_estado: agrupar(cad, 'uf', comUf),
    por_campanha: agrupar(cad, 'campanha', n),
    por_canal: canais,
    vendas_categoria,
    qualidade,
    qualidade_itens,
  };
}

module.exports = { compute };
