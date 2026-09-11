// A casca não tem lógica: ela só desenha o que o motor manda e devolve cliques.
const $ = s => document.querySelector(s);
const api = (p, opts) => fetch(p, opts).then(r => r.json());

let last = null;

function render(s) {
  last = s;
  $('#creature').dataset.mood = s.mood;
  $('#says').textContent = s.says || '';
  $('#pulse').classList.toggle('live', !!s.ollama?.up);
  $('#rootLabel').textContent = (s.config?.destRoot || '').replace(/^\/Users\/[^/]+/, '~');

  const q = s.queue || [];
  $('#queueTitle').textContent = q.length ? `Propostas · ${q.filter(x => !x.autoApplied).length}` : 'Propostas';
  $('#empty').hidden = q.length > 0;
  $('#empty').textContent = s.loose
    ? `${s.loose} arquivo(s) solto(s). Clique em "procurar bagunça".`
    : 'Nada solto no momento. Ele está dormindo.';

  const ul = $('#queue');
  ul.innerHTML = '';
  for (const p of q) ul.appendChild(card(p));

  const st = s.stats || {};
  $('#stats').innerHTML = [
    `movidos <b>${st.moved || 0}</b>`,
    `desfeitos <b>${st.undone || 0}</b>`,
    `aceitação <b>${st.proposals ? Math.round(st.acceptRate * 100) + '%' : '—'}</b>`,
    s.ollama?.up ? `modelo <b>on</b>` : `modelo <b>off</b>`
  ].join('');
}

function card(p) {
  const li = document.createElement('li');
  li.className = 'card' + (p.autoApplied ? ' auto' : '');

  const from = document.createElement('div');
  from.className = 'from';
  from.textContent = p.name;

  const to = document.createElement('div');
  to.className = 'to';
  to.textContent = p.newName;

  const pathEl = document.createElement('div');
  pathEl.className = 'path';
  pathEl.textContent = (p.autoApplied ? '✓ ' : '→ ') + p.folder + '/';

  const why = document.createElement('div');
  why.className = 'why';
  why.textContent = p.reason || '';

  const conf = document.createElement('div');
  conf.className = 'conf';
  conf.textContent = `${Math.round((p.confidence || 0) * 100)}% · ${p.decidedBy || '?'}` +
    (p.extractedVia && p.extractedVia !== 'nenhum' ? ` · ${p.extractedVia}` : '');

  li.append(from, to, pathEl, why, conf);

  if (!p.autoApplied) {
    const input = document.createElement('input');
    input.className = 'folder';
    input.value = p.folder;
    input.title = 'Mude a pasta e aprove — a correção vira dado de treino';

    const acts = document.createElement('div');
    acts.className = 'acts';

    const yes = document.createElement('button');
    yes.className = 'yes';
    yes.textContent = 'pode guardar';
    yes.onclick = async () => {
      yes.disabled = true;
      await api('/api/approve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id, folder: input.value.trim() || p.folder })
      });
    };

    const no = document.createElement('button');
    no.className = 'no';
    no.textContent = 'deixa aí';
    no.onclick = async () => {
      no.disabled = true;
      await api('/api/reject', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id })
      });
    };

    acts.append(yes, no);
    li.append(input, acts);
  }
  return li;
}

// ---- busca: é o pagamento, então é o campo que fica sempre visível ----
let searchTimer;
$('#search').addEventListener('input', e => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  if (q.length < 2) { $('#results').hidden = true; return; }
  searchTimer = setTimeout(() => doSearch(q), 220);
});

$('#search').addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.target.value = ''; $('#results').hidden = true; }
});

async function doSearch(q) {
  const r = await api('/api/find?q=' + encodeURIComponent(q));
  const ul = $('#results');
  ul.innerHTML = '';
  const items = [
    ...r.hits.map(h => ({ ...h, from: 'memoria' })),
    ...(r.spotlight || []).map(p => ({ path: p, name: p.split('/').pop(), from: 'spotlight', exists: true }))
  ];
  if (!items.length) {
    const li = document.createElement('li');
    li.innerHTML = '<span class="fmeta">não achei nada com isso</span>';
    ul.appendChild(li);
  }
  for (const h of items) {
    const li = document.createElement('li');
    const n = document.createElement('span');
    n.className = 'fname' + (h.exists ? '' : ' gone');
    n.textContent = h.name;
    const m = document.createElement('span');
    m.className = 'fmeta';
    m.textContent = [h.category, h.oldName && h.oldName !== h.name ? `antes: ${h.oldName}` : null, h.from]
      .filter(Boolean).join(' · ');
    li.append(n, m);
    li.onclick = () => api('/api/open', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: h.path })
    });
    ul.appendChild(li);
  }
  ul.hidden = false;
}

$('#btnScan').onclick = () => api('/api/scan', { method: 'POST' });
$('#btnUndo').onclick = async () => {
  const r = await api('/api/undo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"n":1}' });
  const ok = r.results?.[0];
  $('#says').textContent = ok?.ok ? 'devolvi pro lugar de antes' : 'não tinha nada pra desfazer';
};
$('#btnQuit').onclick = () => {
  if (window.pastinha?.close) window.pastinha.close();
  else api('/api/quit', { method: 'POST' });
};

// clique no bicho: ele fala de novo
$('#creature').onclick = () => api('/api/state').then(render);

const es = new EventSource('/api/events');
es.onmessage = e => { try { render(JSON.parse(e.data)); } catch { /* frame torto */ } };
es.onerror = () => { $('#pulse').classList.remove('live'); };
api('/api/state').then(render);
