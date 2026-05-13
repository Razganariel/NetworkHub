const API = {
  _token: localStorage.getItem('nh-token'),
  _headers() { const h = { 'Content-Type': 'application/json' }; if (this._token) h['Authorization'] = 'Bearer ' + this._token; return h; },
  async _fetch(url, opts) {
    opts = opts || {};
    const headers = opts.body ? this._headers() : (this._token ? { 'Authorization': 'Bearer ' + this._token } : {});
    const r = await fetch(url, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
    if (r.status === 401) {
      this._token = null; localStorage.removeItem('nh-token'); showLogin();
      const e = await r.json().catch(() => ({ error: 'Unauthorized' }));
      throw Error(e.error);
    }
    return r;
  },
  async get(url) { const r = await this._fetch(url); if (!r.ok) throw Error(r.statusText); return r.json(); },
  async post(url, data) { const r = await this._fetch(url, { method: 'POST', body: JSON.stringify(data) }); if (!r.ok) { const e = await r.json(); throw Error(e.error); } return r.json(); },
  async put(url, data) { const r = await this._fetch(url, { method: 'PUT', body: JSON.stringify(data) }); if (!r.ok) { const e = await r.json(); throw Error(e.error); } return r.json(); },
  async del(url) { const r = await this._fetch(url, { method: 'DELETE' }); if (!r.ok) { const e = await r.json(); throw Error(e.error); } return r.json(); },

  login(username, password) { return this.post('/api/auth/login', { username, password }); },
  logout() { return this.post('/api/auth/logout'); },

  cards(q) { return this.get('/api/cards' + (q ? '?' + new URLSearchParams(q) : '')); },
  card(id) { return this.get('/api/cards/' + id); },
  createCard(d) { return this.post('/api/cards', d); },
  updateCard(id, d) { return this.put('/api/cards/' + id, d); },
  deleteCard(id) { return this.del('/api/cards/' + id); },

  categories() { return this.get('/api/categories'); },
  createCategory(d) { return this.post('/api/categories', d); },
  updateCategory(id, d) { return this.put('/api/categories/' + id, d); },
  deleteCategory(id) { return this.del('/api/categories/' + id); },

  machines() { return this.get('/api/machines'); },
  createMachine(d) { return this.post('/api/machines', d); },
  updateMachine(id, d) { return this.put('/api/machines/' + id, d); },
  deleteMachine(id) { return this.del('/api/machines/' + id); },

  outils() { return this.get('/api/outils'); },
  createOutil(d) { return this.post('/api/outils', d); },
  updateOutil(id, d) { return this.put('/api/outils/' + id, d); },
  deleteOutil(id) { return this.del('/api/outils/' + id); },

  osList() { return this.get('/api/os'); },
  createOs(d) { return this.post('/api/os', d); },
  updateOs(id, d) { return this.put('/api/os/' + id, d); },
  deleteOs(id) { return this.del('/api/os/' + id); },

  fabriquants() { return this.get('/api/fabriquants'); },
  createFabriquant(d) { return this.post('/api/fabriquants', d); },
  updateFabriquant(id, d) { return this.put('/api/fabriquants/' + id, d); },
  deleteFabriquant(id) { return this.del('/api/fabriquants/' + id); },

  health() { return this.get('/api/health'); },
  refreshHealth() { return this.post('/api/health/refresh'); },

  icons() { return this.get('/api/icons'); },
  icon(id) { return this.get('/api/icons/' + id); },
  createIcon(d) { return this.post('/api/icons', d); },
  updateIcon(id, d) { return this.put('/api/icons/' + id, d); },
  deleteIcon(id) { return this.del('/api/icons/' + id); },

  settings() { return this.get('/api/settings'); },
  updateSetting(key, value) { return this.put('/api/settings', { key, value }); },

  me() { return this.get('/api/users/me'); },
  updateMe(d) { return this.put('/api/users/me', d); },
  users() { return this.get('/api/users'); },
  createUser(d) { return this.post('/api/users', d); },
  updateUser(id, d) { return this.put('/api/users/' + id, d); },
  deleteUser(id) { return this.del('/api/users/' + id); },
};

// ── State ──
const state = {
  cards: [],
  categories: [],
  machines: [],
  outils: [],
  osList: [],
  fabriquants: [],
  icons: [],
  settings: [],
  health: {},
  users: [],
  me: null,
  view: 'dashboard',
  settingsTab: 'cards',
  dashboardTab: localStorage.getItem('nh-dash-tab') || 'grid',
  theme: localStorage.getItem('nh-theme') || 'dark',
  filters: { search: '', categorie_id: '', status: 'all' },
};

// ── Helpers ──
function $(sel, ctx) { return (ctx || document).querySelector(sel); }
function $$(sel, ctx) { return [...(ctx || document).querySelectorAll(sel)]; }
function html(strings, ...vals) {
  return strings.reduce((acc, s, i) => acc + s + (vals[i] !== undefined ? vals[i] : ''), '');
}
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

const COLORBLIND_PALETTES = {
  normal: {
    green: '#3fb950', red: '#f85149', orange: '#d29922', primary: '#1f6feb',
    greenGlow: 'rgba(63,185,80,.5)', redGlow: 'rgba(248,81,73,.4)', orangeGlow: 'rgba(210,153,34,.4)',
  },
  protanopia: {
    green: '#58a6ff', red: '#d4770c', orange: '#8b949e', primary: '#58a6ff',
    greenGlow: 'rgba(88,166,255,.5)', redGlow: 'rgba(212,119,12,.4)', orangeGlow: 'rgba(139,148,158,.4)',
  },
  deuteranopia: {
    green: '#58a6ff', red: '#d4770c', orange: '#8b949e', primary: '#58a6ff',
    greenGlow: 'rgba(88,166,255,.5)', redGlow: 'rgba(212,119,12,.4)', orangeGlow: 'rgba(139,148,158,.4)',
  },
  tritanopia: {
    green: '#3fb950', red: '#f85149', orange: '#8b949e', primary: '#e85d04',
    greenGlow: 'rgba(63,185,80,.5)', redGlow: 'rgba(248,81,73,.4)', orangeGlow: 'rgba(139,148,158,.4)',
  },
  achromatopsia: {
    green: '#b0b0b0', red: '#404040', orange: '#808080', primary: '#606060',
    greenGlow: 'rgba(176,176,176,.4)', redGlow: 'rgba(64,64,64,.4)', orangeGlow: 'rgba(128,128,128,.4)',
  },
};

function applyColorblindMode(mode) {
  const p = COLORBLIND_PALETTES[mode] || COLORBLIND_PALETTES.normal;
  const root = document.documentElement;
  for (const [key, val] of Object.entries(p)) {
    const cssVar = key.replace(/([A-Z])/g, '-$1').toLowerCase();
    root.style.setProperty(`--${cssVar}`, val);
  }
  root.dataset.cb = mode === 'normal' ? '' : mode;
}

function applyHighContrast(enabled) {
  document.documentElement.dataset.hc = enabled ? 'high' : '';
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function buildUrl(prefix, baseUrl, port, mainPage) {
  let url = prefix + baseUrl.replace(/\/+$/, '');
  const p = String(port);
  if (p && p !== '80' && p !== '443') url += ':' + p;
  url += (mainPage || '/');
  return url;
}

// ── Navigation ──
$$('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    $$('.view').forEach(v => v.classList.remove('active'));
    const view = $(`#view-${btn.dataset.view}`);
    if (view) view.classList.add('active');
    state.view = btn.dataset.view;
    $(`#hamburger`).click();
    if (state.view === 'dashboard') {
      activateDashTab(state.dashboardTab);
      refreshDashboard();
    } else if (state.view === 'settings') {
      renderSettings();
    }
  });
});

$('#hamburger').addEventListener('click', () => {
  $('.nav-links').classList.toggle('open');
});

// ── Theme ──
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : '');
  const icon = theme === 'light' ? '☀️' : '🌙';
  $$('.theme-toggle').forEach(el => el.textContent = icon);
  localStorage.setItem('nh-theme', theme);
}
applyTheme(state.theme);

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  applyTheme(state.theme);
}
$$('.theme-toggle').forEach(el => el.addEventListener('click', toggleTheme));

// ── Auth ──
async function handleLogin() {
  const username = $('#login-username').value.trim();
  const password = $('#login-password').value;
  const errEl = $('#login-error');
  errEl.style.display = 'none';
  if (!username || !password) { errEl.textContent = 'Veuillez remplir tous les champs'; errEl.style.display = ''; return; }
  try {
    const res = await API.login(username, password);
    API._token = res.token;
    localStorage.setItem('nh-token', res.token);
    state.me = res.user;
    showApp();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = '';
  }
}

$('#login-btn').addEventListener('click', handleLogin);
['keydown'].forEach(ev => {
  document.addEventListener(ev, e => {
    if (e.key === 'Enter' && $('#login-page').style.display !== 'none') handleLogin();
  });
});

$('#btn-logout').addEventListener('click', async () => {
  try { await API.logout(); } catch {}
  API._token = null;
  localStorage.removeItem('nh-token');
  state.me = null;
  showLogin();
});

function showLogin() {
  $('#login-page').style.display = 'flex';
  $('#app-nav').style.display = 'none';
  $('#app-main').style.display = 'none';
  $('#login-password').value = '';
  $('#login-error').style.display = 'none';
}

function showApp() {
  $('#login-page').style.display = 'none';
  $('#app-nav').style.display = '';
  $('#app-main').style.display = '';
  state.view = 'dashboard';
  $$('.nav-btn').forEach(b => b.classList.remove('active'));
  const dbBtn = $(`.nav-btn[data-view="dashboard"]`);
  if (dbBtn) dbBtn.classList.add('active');
  $$('.view').forEach(v => v.classList.remove('active'));
  const dv = $('#view-dashboard');
  if (dv) dv.classList.add('active');
  activateDashTab(state.dashboardTab);
  refreshDashboard();
}

// ── Dashboard tabs ──
function activateDashTab(tabId) {
  $$('.dash-tab').forEach(t => t.classList.remove('active'));
  const tab = $(`.dash-tab[data-dash="${tabId}"]`);
  if (tab) tab.classList.add('active');
  state.dashboardTab = tabId;
  localStorage.setItem('nh-dash-tab', tabId);
}
$$('.dash-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    activateDashTab(tab.dataset.dash);
    renderCards();
  });
});

// ── Filters ──
function applyFilters() {
  state.filters.search = $('#filter-search').value;
  state.filters.categorie_id = $('#filter-category').value;
  state.filters.status = $('#filter-status').value;
}

$('#filter-search').addEventListener('input', () => {
  applyFilters();
  loadCards().then(renderCards);
});

$('#filter-search').addEventListener('search', () => {
  applyFilters();
  loadCards().then(renderCards);
});

$('#filter-category').addEventListener('input', () => {
  applyFilters();
  loadCards().then(renderCards);
});

$('#filter-status').addEventListener('input', () => {
  applyFilters();
  renderCards();
});

$('#btn-refresh').addEventListener('click', async () => {
  await refreshDashboard();
});

$('#btn-reset').addEventListener('click', () => {
  $('#filter-search').value = '';
  $('#filter-category').value = '';
  $('#filter-status').value = 'all';
  applyFilters();
  loadCards().then(renderCards);
});

$('#btn-add-card').addEventListener('click', () => openCardModal());

// ── Dashboard ──
async function refreshDashboard() {
  await Promise.all([
    loadCards(),
    loadCategories().then(() => populateCategoryFilter()),
    loadMachines(),
    loadOutils(),
  ]);
  renderCards();
  loadHealth().then(renderCards);
}

async function loadCards() {
  const params = {};
  if (state.filters.search) params.search = state.filters.search;
  if (state.filters.categorie_id) params.categorie_id = state.filters.categorie_id;
  state.cards = await API.cards(Object.keys(params).length ? params : undefined);
}

async function loadCategories() {
  state.categories = await API.categories();
}

async function loadMachines() { state.machines = await API.machines(); }
async function loadOutils() { state.outils = await API.outils(); }
async function loadOs() { state.osList = await API.osList(); }
async function loadFabriquants() { state.fabriquants = await API.fabriquants(); }
async function loadIcons() { state.icons = await API.icons(); }
async function loadSettings() {
  state.settings = await API.settings();
  const cb = state.settings.find(s => s.key === 'colorblind.mode');
  if (cb) applyColorblindMode(cb.value);
  const hc = state.settings.find(s => s.key === 'high.contrast');
  if (hc) applyHighContrast(hc.value === 'true');
}

async function loadHealth() {
  state.health = await API.health();
}

function populateCategoryFilter() {
  const sel = $('#filter-category');
  const cur = sel.value;
  sel.innerHTML = '<option value="">Toutes les catégories</option>' +
    state.categories.map(c => `<option value="${c.id}"${c.id == cur ? ' selected' : ''}>${esc(c.nom)}</option>`).join('');
}

function isOnline(cardId) {
  const h = state.health[cardId];
  if (!h) return null;
  return h.online;
}

function cardHtml(c) {
  const h = state.health[c.id];
  const online = h ? h.online : null;
  const ms = h ? h.ms : null;
  const statusClass = online === null ? 'checking' : online ? 'on' : 'off';
  const statusIcon = online === null ? '⟳' : online ? '✓' : '✕';
  const statusText = online === null ? 'Vérification...' : online ? `${ms}ms` : 'Hors ligne';
  const catColor = c.categorie_couleur || '#58a6ff';
  const catName = c.categorie_nom || '';

  return html`
    <div class="card" data-id="${c.id}">
      <div class="card-header">
        <span class="card-dot ${statusClass}"></span>
        ${c.outil_icon_id ? `<img class="card-header-icon" src="/api/icons/${c.outil_icon_id}/file" alt="">` : ''}
        <span class="card-name">${esc(c.nom)}</span>
      </div>
      <div class="card-tags">
        ${catName ? `<span class="card-tag" style="background:${catColor}22;color:${catColor}">${esc(catName)}</span>` : ''}
        <span class="card-tag status-${statusClass}" style="margin-left:auto">${statusIcon} ${statusText}</span>
      </div>
      <div class="card-url">${esc(c.url)}</div>
      <div class="card-actions">
        <a class="btn btn-primary" href="${esc(c.url)}" target="_blank" rel="noopener">Ouvrir</a>
        <button class="btn btn-sm" data-edit-card="${c.id}">✎</button>
        <button class="btn btn-sm btn-danger" data-delete-card="${c.id}">✕</button>
      </div>
    </div>
  `;
}

function attachCardListeners(container) {
  container.querySelectorAll('[data-edit-card]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const id = parseInt(el.dataset.editCard);
      const card = state.cards.find(c => c.id === id);
      if (card) openCardModal(card);
    });
  });
  container.querySelectorAll('[data-delete-card]').forEach(el => {
    el.addEventListener('click', async e => {
      e.stopPropagation();
      const id = parseInt(el.dataset.deleteCard);
      if (confirm('Supprimer cette carte ?')) {
        await API.deleteCard(id);
        await refreshDashboard();
      }
    });
  });
}

function getFilteredCards() {
  let f = state.cards;
  const sf = state.filters.status;
  if (sf !== 'all') {
    f = f.filter(c => {
      const online = isOnline(c.id);
      if (sf === 'online') return online === true;
      if (sf === 'offline') return online === false || online === null;
      return true;
    });
  }
  return f;
}

function renderCards() {
  const filtered = getFilteredCards();

  if (!filtered.length) {
    $('#grid').innerHTML = '<div class="loading">Aucune carte trouvée</div>';
    $('#count-label').textContent = '0 cartes';
    return;
  }

  $('#count-label').textContent = `${filtered.length} carte${filtered.length > 1 ? 's' : ''}`;

  if (state.dashboardTab === 'machine') return renderCardsByMachine(filtered);
  if (state.dashboardTab === 'outil') return renderCardsByOutil(filtered);
  renderCardsGrid(filtered);
}

function renderCardsGrid(filtered) {
  const grid = $('#grid');
  grid.innerHTML = filtered.map(c => cardHtml(c)).join('');
  attachCardListeners(grid);
}

function groupCards(filtered, key) {
  const groups = {};
  for (const c of filtered) {
    const k = (c[key] || 'Inconnu').trim() || 'Inconnu';
    if (!groups[k]) groups[k] = [];
    groups[k].push(c);
  }
  const sorted = Object.keys(groups).sort();
  return sorted.map(name => ({ name, cards: groups[name] }));
}

function renderCardsByMachine(filtered) {
  const grid = $('#grid');
  const groups = groupCards(filtered, 'machine_nom');

  grid.innerHTML = groups.map(g => html`
    <div class="group-section">
      <div class="group-header">
        <span class="group-name">${esc(g.name)}</span>
        <span class="group-count">${g.cards.length} carte${g.cards.length > 1 ? 's' : ''}</span>
      </div>
      <div class="group-grid">${g.cards.map(c => cardHtml(c)).join('')}</div>
    </div>
  `).join('');

  grid.querySelectorAll('.group-grid').forEach(gg => attachCardListeners(gg));
}

function renderCardsByOutil(filtered) {
  const grid = $('#grid');
  const groups = groupCards(filtered, 'outil_nom');

  grid.innerHTML = groups.map(g => html`
    <div class="group-section">
      <div class="group-header">
        <span class="group-name">${esc(g.name)}</span>
        <span class="group-count">${g.cards.length} carte${g.cards.length > 1 ? 's' : ''}</span>
      </div>
      <div class="group-grid">${g.cards.map(c => cardHtml(c)).join('')}</div>
    </div>
  `).join('');

  grid.querySelectorAll('.group-grid').forEach(gg => attachCardListeners(gg));
}

// ── Card Modal ──
async function openCardModal(card) {
  await Promise.all([loadMachines(), loadOutils(), loadCategories()]);

  const editMode = !!card;
  const title = editMode ? 'Modifier la carte' : 'Ajouter une carte';

  const modalBody = html`
    <div class="form-group">
      <label>Machine</label>
      <select class="input" id="card-machine">
        <option value="">Sélectionner une machine...</option>
        ${state.machines.map(m => `<option value="${m.id}"${card && card.machine_id === m.id ? ' selected' : ''}>${esc(m.nom)} (${esc(m.ip)})</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Outil</label>
      <select class="input" id="card-outil">
        <option value="">Sélectionner un outil...</option>
        ${state.outils.map(o => `<option value="${o.id}"${card && card.outil_id === o.id ? ' selected' : ''}>${esc(o.nom)}</option>`).join('')}
      </select>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Nom</label>
        <input class="input" id="card-nom" value="${esc(card ? card.nom : '')}" placeholder="Auto si vide">
        <div class="form-hint">Laissez vide pour auto-générer</div>
      </div>
      <div class="form-group">
        <label>Préfixe</label>
        <select class="input" id="card-prefix">
          <option value="http://"${!card || card.prefix === 'http://' ? ' selected' : ''}>http://</option>
          <option value="https://"${card && card.prefix === 'https://' ? ' selected' : ''}>https://</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>Base URL <span class="auto-fill">(vide = IP de la machine)</span></label>
      <input class="input" id="card-baseurl" value="${esc(card ? card.base_url : '')}" placeholder="192.168.1.x">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Port <span class="auto-fill">(vide = port de l'outil)</span></label>
        <input class="input" id="card-port" value="${card && card.outil_port ? card.outil_port : ''}" placeholder="ex: 8080">
      </div>
      <div class="form-group">
        <label>Page d'accueil <span class="auto-fill">(vide = page de l'outil)</span></label>
        <input class="input" id="card-mainpage" value="${esc(card && card.outil_main_page ? card.outil_main_page : '')}" placeholder="/admin">
      </div>
    </div>
    <div class="form-group">
      <label>URL générée</label>
      <input class="input" id="card-url" value="${esc(card ? card.url : '')}" placeholder="URL générée automatiquement" readonly style="color:var(--text-dim)">
      <div class="form-hint">Générée automatiquement, éditable ci-dessus</div>
    </div>
    <div class="form-group">
      <label>Catégorie</label>
      <select class="input" id="card-categorie">
        ${state.categories.map(cat => `<option value="${cat.id}"${card && card.categorie_id === cat.id ? ' selected' : ''}>${esc(cat.nom)}</option>`).join('')}
      </select>
    </div>
  `;

  const modalFooter = html`
    <button class="btn" id="modal-cancel">Annuler</button>
    <button class="btn btn-primary" id="modal-save">${editMode ? 'Enregistrer' : 'Ajouter'}</button>
  `;

  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = modalBody;
  $('#modal-footer').innerHTML = modalFooter;
  openModal();

  // Auto-fill logic
  function autoFill() {
    const machineId = parseInt($('#card-machine').value);
    const outilId = parseInt($('#card-outil').value);
    const machine = state.machines.find(m => m.id === machineId);
    const outil = state.outils.find(o => o.id === outilId);

    if (!editMode) {
      if (machine && outil) {
        if (!$('#card-nom').value || $('#card-nom').dataset.autofilled) {
          $('#card-nom').value = `${machine.nom} - ${outil.nom}`;
          $('#card-nom').dataset.autofilled = '1';
        }
        if (!$('#card-baseurl').value || $('#card-baseurl').dataset.autofilled) {
          $('#card-baseurl').value = machine.ip;
          $('#card-baseurl').dataset.autofilled = '1';
        }
        if (!$('#card-port').value || $('#card-port').dataset.autofilled) {
          $('#card-port').value = outil.port || '';
          $('#card-port').dataset.autofilled = '1';
        }
        if (!$('#card-mainpage').value || $('#card-mainpage').dataset.autofilled) {
          $('#card-mainpage').value = outil.main_page || '/';
          $('#card-mainpage').dataset.autofilled = '1';
        }
      }
    }

    const prefix = $('#card-prefix').value;
    const baseUrl = $('#card-baseurl').value;
    const port = $('#card-port').value;
    const mainPage = $('#card-mainpage').value;
    const generatedUrl = buildUrl(prefix, baseUrl || (machine ? machine.ip : ''), port, mainPage);
    $('#card-url').value = generatedUrl;

    if (!editMode && outil) {
      $('#card-categorie').value = outil.categorie_id || '';
    }
  }

  $('#card-machine').addEventListener('change', autoFill);
  $('#card-outil').addEventListener('change', autoFill);
  $('#card-prefix').addEventListener('change', autoFill);
  $('#card-baseurl').addEventListener('input', () => { delete $('#card-baseurl').dataset.autofilled; autoFill(); });
  $('#card-port').addEventListener('input', () => { delete $('#card-port').dataset.autofilled; autoFill(); });
  $('#card-mainpage').addEventListener('input', () => { delete $('#card-mainpage').dataset.autofilled; autoFill(); });
  $('#card-nom').addEventListener('input', () => { delete $('#card-nom').dataset.autofilled; });

  if (editMode) autoFill();

  $('#modal-save').addEventListener('click', async () => {
    const data = {
      nom: $('#card-nom').value || `${state.machines.find(m => m.id === parseInt($('#card-machine').value))?.nom || ''} - ${state.outils.find(o => o.id === parseInt($('#card-outil').value))?.nom || ''}`,
      prefix: $('#card-prefix').value,
      base_url: $('#card-baseurl').value,
      url: $('#card-url').value,
      categorie_id: parseInt($('#card-categorie').value) || null,
      outil_id: parseInt($('#card-outil').value) || null,
      machine_id: parseInt($('#card-machine').value) || null,
    };

    if (!data.machine_id || !data.outil_id) {
      alert('Veuillez sélectionner une machine et un outil');
      return;
    }

    try {
      if (editMode) {
        await API.updateCard(card.id, data);
      } else {
        await API.createCard(data);
      }
      closeModal();
      await API.refreshHealth();
      state.health = await API.health();
      await refreshDashboard();
    } catch (err) {
      alert('Erreur : ' + err.message);
    }
  });

  $('#modal-cancel').addEventListener('click', closeModal);
}

// ── Profile ──
async function renderProfile() {
  if (!state.me) state.me = await API.me();
  const u = state.me;

  $('#profile-form').innerHTML = `
    <div class="form-group">
      <label>Nom</label>
      <input class="input" id="profile-nom" value="${esc(u.nom || '')}">
    </div>
    <div class="form-group">
      <label>Prénom</label>
      <input class="input" id="profile-prenom" value="${esc(u.prenom || '')}">
    </div>
    <div class="form-group">
      <label>Nom d'utilisateur</label>
      <input class="input" id="profile-username" value="${esc(u.username)}">
    </div>
    <div class="form-group">
      <label>Email</label>
      <input class="input" id="profile-email" value="${esc(u.email || '')}" type="email">
    </div>
    <div class="form-group">
      <label>Mot de passe <button class="btn btn-sm" id="profile-change-pwd" style="margin-left:.5rem">Modifier</button></label>
    </div>
    <div class="form-group">
      <label>Rôle</label>
      <input class="input" value="${esc(u.role)}" readonly style="text-transform:capitalize">
    </div>
    <button class="btn btn-primary" id="profile-save">Enregistrer</button>
    <span id="profile-msg" style="margin-left:.75rem;font-size:.85rem;color:var(--green)"></span>
  `;

  $('#profile-save').addEventListener('click', async () => {
    const data = {
      nom: $('#profile-nom').value,
      prenom: $('#profile-prenom').value,
      username: $('#profile-username').value,
      email: $('#profile-email').value,
    };
    if (!data.username) { alert('Le nom d\'utilisateur est requis'); return; }
    try {
      state.me = await API.updateMe(data);
      $('#profile-msg').textContent = 'Profil enregistré.';
      setTimeout(() => { $('#profile-msg').textContent = ''; }, 3000);
    } catch (err) {
      $('#profile-msg').textContent = 'Erreur : ' + err.message;
      $('#profile-msg').style.color = 'var(--red)';
    }
  });

  $('#profile-change-pwd').addEventListener('click', () => openPasswordModal());
}

// ── Settings ──
$$('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.settingsTab = btn.dataset.tab;
    renderSettingsTable();
  });
});

async function renderSettings() {
  await loadAllEntities();
  const isAdmin = state.me && state.me.role === 'admin';
  const comptesTab = $('#tab-comptes');
  if (comptesTab) comptesTab.style.display = isAdmin ? '' : 'none';
  if (!isAdmin && state.settingsTab === 'comptes') {
    state.settingsTab = 'settings';
    $$('.tab-btn').forEach(b => b.classList.remove('active'));
    const st = $(`.tab-btn[data-tab="settings"]`);
    if (st) st.classList.add('active');
  }
  renderSettingsTable();
}

async function loadUsers() { state.users = await API.users(); }
async function loadMe() { state.me = await API.me(); }

async function loadAllEntities() {
  await Promise.all([
    loadCards(),
    loadCategories(),
    loadMachines(),
    loadOutils(),
    loadOs(),
    loadFabriquants(),
    loadIcons(),
    loadSettings(),
    loadUsers(),
    loadMe(),
  ]);
}

async function renderSettingsTable() {
  const container = $('#settings-content');
  const tab = state.settingsTab;

  let rows;
  let title;
  let fields;

  switch (tab) {
    case 'cards': {
      title = 'Cartes';
      fields = ['Nom', 'URL', 'Machine', 'Outil', 'Catégorie'];
      rows = state.cards.map(c => ({
        id: c.id,
        cells: [c.nom, c.url, c.machine_nom || '-', c.outil_nom || '-', c.categorie_nom || '-'],
      }));
      break;
    }
    case 'machines': {
      title = 'Machines';
      fields = ['Nom', 'Hostname', 'IP', 'OS', 'Fabriquant'];
      rows = state.machines.map(m => ({
        id: m.id,
        cells: [m.nom, m.hostname || '-', m.ip, m.os_nom || '-', m.fabriquant_nom || (m.fabriquant_modele ? `${m.fabriquant_nom} ${m.fabriquant_modele}` : '-')],
      }));
      break;
    }
    case 'outils': {
      title = 'Outils';
      fields = ['Nom', 'Catégorie', 'Port', 'Page d\'accueil'];
      rows = state.outils.map(o => ({
        id: o.id,
        cells: [o.nom, o.categorie_nom || '-', o.port || '-', o.main_page],
      }));
      break;
    }
    case 'categories': {
      title = 'Catégories';
      fields = ['Nom', 'Couleur'];
      rows = state.categories.map(c => ({
        id: c.id,
        cells: [c.nom, `<span class="tag" style="background:${c.couleur}22;color:${c.couleur}">${c.couleur}</span>`],
      }));
      break;
    }
    case 'os': {
      title = 'Systèmes d\'exploitation';
      fields = ['Nom', 'Version'];
      rows = state.osList.map(o => ({
        id: o.id,
        cells: [o.nom, o.version || '-'],
      }));
      break;
    }
    case 'fabriquants': {
      title = 'Fabriquants';
      fields = ['Nom', 'Modèle'];
      rows = state.fabriquants.map(f => ({
        id: f.id,
        cells: [f.nom, f.modele || '-'],
      }));
      break;
    }
    case 'icons': {
      title = 'Icônes';
      fields = ['Aperçu', 'Nom', 'Fichier', 'Type'];
      rows = state.icons.map(i => ({
        id: i.id,
        cells: [`<img src="/api/icons/${i.id}/file" style="width:32px;height:32px;border-radius:6px" alt="">`, i.nom, i.filename || '-', i.entity_type || '-'],
      }));
      break;
    }
    case 'settings': {
      if (!state.settings.length) {
        container.innerHTML = '<div class="loading">Chargement...</div>';
        return;
      }
      container.innerHTML = html`
        <div class="settings-header">
          <h3>Paramètres</h3>
        </div>
        <div class="settings-form">
          ${state.settings.map(s => html`
            <div class="form-group">
              <label>${esc(s.label)}</label>
              ${s.type === 'boolean'
                ? html`<label class="toggle">
                    <input type="checkbox" class="setting-input" id="setting-${esc(s.key.replace(/\./g,'-'))}"${s.value === 'true' ? ' checked' : ''}>
                    <span class="toggle-slider"></span>
                  </label>`
                : s.type === 'select'
                  ? html`<select class="input setting-input" id="setting-${esc(s.key.replace(/\./g,'-'))}">
                      ${(s.options || []).map(o => `<option value="${esc(o.value)}"${s.value === o.value ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}
                    </select>`
                  : html`<input class="input setting-input" id="setting-${esc(s.key.replace(/\./g,'-'))}" value="${esc(s.value)}" placeholder="${esc(s.default)}" type="number" min="1">`
              }
              <div class="form-hint">${esc(s.description)}${s.type === 'number' ? html`<br>Défaut : ${esc(s.default)} ms` : ''}</div>
            </div>
          `).join('')}
          <button class="btn btn-primary" id="settings-save">Enregistrer</button>
          <span id="settings-msg" style="margin-left:.75rem;font-size:.85rem;color:var(--green)"></span>
        </div>
      `;

      $('#settings-save').addEventListener('click', async () => {
        const inputs = container.querySelectorAll('.setting-input');
        const msg = $('#settings-msg');
        msg.textContent = '';
        try {
          for (const inp of inputs) {
            const key = inp.id.replace(/^setting-/, '').replace(/-/g, '.');
            const value = inp.type === 'checkbox' ? (inp.checked ? 'true' : 'false') : inp.value;
            await API.updateSetting(key, value);
          }
          await loadSettings();
          msg.textContent = 'Paramètres enregistrés.';
          setTimeout(() => { msg.textContent = ''; }, 3000);
        } catch (err) {
          msg.textContent = 'Erreur : ' + err.message;
          msg.style.color = 'var(--red)';
        }
      });
      return;
    }
    case 'profile': {
      container.innerHTML = '<div id="profile-form"></div>';
      renderProfile();
      return;
    }
    case 'comptes': {
      title = 'Comptes utilisateurs';
      fields = ['Nom', 'Prénom', 'Nom d\'utilisateur', 'Email', 'Rôle'];
      rows = state.users.map(u => ({
        id: u.id,
        cells: [u.nom || '-', u.prenom || '-', u.username, u.email || '-', `<span class="tag" style="text-transform:capitalize">${esc(u.role)}</span>`],
        deletable: !state.me || u.id !== state.me.id,
      }));
      container.innerHTML = html`
        <div class="settings-header">
          <h3>${esc(title)}</h3>
          <button class="btn btn-primary btn-sm" id="settings-add">+ Ajouter un compte</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr>${fields.map(f => `<th>${esc(f)}</th>`).join('')}<th style="width:80px">Actions</th></tr></thead>
            <tbody>
              ${rows.length ? rows.map(r => html`
                <tr>
                  ${r.cells.map(c => `<td>${c}</td>`).join('')}
                  <td class="actions">
                    <button class="btn-icon" data-edit="comptes-${r.id}" title="Modifier">✎</button>
                    ${r.deletable ? `<button class="btn-icon" data-delete="comptes-${r.id}" title="Supprimer" style="color:var(--red)">✕</button>` : ''}
                  </td>
                </tr>
              `).join('') : '<tr><td colspan="99" style="text-align:center;color:var(--text-muted);padding:2rem">Aucun utilisateur</td></tr>'}
            </tbody>
          </table>
        </div>
      `;

      $('#settings-add').addEventListener('click', () => openUserModal());

      container.querySelectorAll('[data-edit]').forEach(el => {
        el.addEventListener('click', async () => {
          const id = parseInt(el.dataset.edit.split('-')[1]);
          const u = state.users.find(x => x.id === id);
          if (u) openUserModal(u);
        });
      });

      container.querySelectorAll('[data-delete]').forEach(el => {
        el.addEventListener('click', async () => {
          const id = parseInt(el.dataset.delete.split('-')[1]);
          if (!confirm('Supprimer définitivement ce compte ?')) return;
          try {
            await API.deleteUser(id);
            await loadAllEntities();
            renderSettingsTable();
          } catch (err) {
            alert('Erreur : ' + err.message);
          }
        });
      });
      return;
    }
  }

  const entityMap = {
    cards: { create: () => openCardModal(), label: 'Carte' },
    machines: { create: () => openEntityModal('machines', 'Machine', ['nom', 'hostname', 'ip', 'os_id', 'fabriquant_id', 'icon_id']), label: 'Machine' },
    outils: { create: () => openEntityModal('outils', 'Outil', ['nom', 'categorie_id', 'port', 'main_page', 'icon_id']), label: 'Outil' },
    categories: { create: () => openEntityModal('categories', 'Catégorie', ['nom', 'couleur', 'icon_id']), label: 'Catégorie' },
    os: { create: () => openEntityModal('os', 'OS', ['nom', 'version', 'icon_id']), label: 'OS' },
    fabriquants: { create: () => openEntityModal('fabriquants', 'Fabriquant', ['nom', 'modele']), label: 'Fabriquant' },
    icons: { create: () => openEntityModal('icons', 'Icône', ['nom', 'filename', 'entity_type', 'data']), label: 'Icône' },
  };
  const entity = entityMap[tab];
  const apiMap = {
    cards: API, machines: API, outils: API, categories: API, os: API, fabriquants: API, icons: API,
  };
  const deleteMethods = {
    cards: (id) => API.deleteCard(id),
    machines: (id) => API.deleteMachine(id),
    outils: (id) => API.deleteOutil(id),
    categories: (id) => API.deleteCategory(id),
    os: (id) => API.deleteOs(id),
    fabriquants: (id) => API.deleteFabriquant(id),
    icons: (id) => API.deleteIcon(id),
  };
  const editModals = {
    machines: (item) => openEntityModal('machines', 'Machine', ['nom', 'hostname', 'ip', 'os_id', 'fabriquant_id', 'icon_id'], item),
    outils: (item) => openEntityModal('outils', 'Outil', ['nom', 'categorie_id', 'port', 'main_page', 'icon_id'], item),
    categories: (item) => openEntityModal('categories', 'Catégorie', ['nom', 'couleur', 'icon_id'], item),
    os: (item) => openEntityModal('os', 'OS', ['nom', 'version', 'icon_id'], item),
    fabriquants: (item) => openEntityModal('fabriquants', 'Fabriquant', ['nom', 'modele'], item),
    icons: (item) => openEntityModal('icons', 'Icône', ['nom', 'filename', 'entity_type', 'data'], item),
  };

  container.innerHTML = html`
    <div class="settings-header">
      <h3>${esc(title)}</h3>
      <button class="btn btn-primary btn-sm" id="settings-add">+ Ajouter ${entity.label}</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>${fields.map(f => `<th>${esc(f)}</th>`).join('')}<th style="width:80px">Actions</th></tr></thead>
        <tbody>
          ${rows.length ? rows.map(r => html`
            <tr>
              ${r.cells.map(c => `<td>${c}</td>`).join('')}
              <td class="actions">
                <button class="btn-icon" data-edit="${tab}-${r.id}" title="Modifier">✎</button>
                <button class="btn-icon" data-delete="${tab}-${r.id}" title="Supprimer" style="color:var(--red)">✕</button>
              </td>
            </tr>
          `).join('') : '<tr><td colspan="99" style="text-align:center;color:var(--text-muted);padding:2rem">Aucune entrée</td></tr>'}
        </tbody>
      </table>
    </div>
  `;

  $('#settings-add').addEventListener('click', entity.create);

  container.querySelectorAll('[data-edit]').forEach(el => {
    el.addEventListener('click', async () => {
      const [type, idStr] = el.dataset.edit.split('-');
      const id = parseInt(idStr);
      const items = { cards: state.cards, machines: state.machines, outils: state.outils, categories: state.categories, os: state.osList, fabriquants: state.fabriquants, icons: state.icons }[type];
      const item = items.find(i => i.id === id);
      if (type === 'cards' && item) openCardModal(item);
      else if (editModals[type] && item) editModals[type](item);
    });
  });

  container.querySelectorAll('[data-delete]').forEach(el => {
    el.addEventListener('click', async () => {
      const [type, idStr] = el.dataset.delete.split('-');
      const id = parseInt(idStr);
      if (!confirm('Supprimer définitivement ?')) return;
      await deleteMethods[type](id);
      await loadAllEntities();
      await renderSettingsTable();
      if (state.view === 'dashboard') await refreshDashboard();
    });
  });
}

// ── Password Modal ──
async function openPasswordModal(forUserId) {
  const isOwn = !forUserId;
  $('#modal-title').textContent = isOwn ? 'Changer mon mot de passe' : 'Changer le mot de passe';
  $('#modal-body').innerHTML = `
    ${isOwn ? `
    <div class="form-group">
      <label>Mot de passe actuel</label>
      <input class="input" id="pwd-current" type="password" autocomplete="current-password">
    </div>` : ''}
    <div class="form-group">
      <label>Nouveau mot de passe</label>
      <input class="input" id="pwd-new" type="password" autocomplete="new-password">
    </div>
    <div class="form-group">
      <label>Confirmer le mot de passe</label>
      <input class="input" id="pwd-confirm" type="password" autocomplete="new-password">
    </div>
  `;
  $('#modal-footer').innerHTML = `
    <button class="btn" id="modal-cancel">Annuler</button>
    <button class="btn btn-primary" id="modal-save">Enregistrer</button>
  `;
  openModal();

  $('#modal-save').addEventListener('click', async () => {
    const newPwd = $('#pwd-new').value;
    const confirm = $('#pwd-confirm').value;
    if (!newPwd || newPwd !== confirm) { alert('Les mots de passe ne correspondent pas'); return; }
    try {
      if (isOwn) {
        const cur = $('#pwd-current').value;
        if (!cur) { alert('Veuillez saisir votre mot de passe actuel'); return; }
        await API.post('/api/users/change-password', { currentPassword: cur, newPassword: newPwd });
      } else {
        await API.updateUser(forUserId, { password: newPwd });
      }
      alert('Mot de passe mis à jour.');
      closeModal();
    } catch (err) {
      alert('Erreur : ' + err.message);
    }
  });

  $('#modal-cancel').addEventListener('click', closeModal);
}

// ── User Modal ──
async function openUserModal(user) {
  const editMode = !!user;

  $('#modal-title').textContent = editMode ? 'Modifier le compte' : 'Ajouter un compte';
  $('#modal-body').innerHTML = `
    <div class="form-group">
      <label>Nom</label>
      <input class="input" id="user-nom" value="${esc(user ? user.nom : '')}">
    </div>
    <div class="form-group">
      <label>Prénom</label>
      <input class="input" id="user-prenom" value="${esc(user ? user.prenom : '')}">
    </div>
    <div class="form-group">
      <label>Nom d'utilisateur</label>
      <input class="input" id="user-username" value="${esc(user ? user.username : '')}">
    </div>
    <div class="form-group">
      <label>Email</label>
      <input class="input" id="user-email" value="${esc(user ? (user.email || '') : '')}" type="email">
    </div>
    ${editMode ? `
    <div class="form-group">
      <label>Mot de passe <button class="btn btn-sm" id="user-change-pwd" style="margin-left:.5rem">Modifier</button></label>
    </div>` : `
    <div class="form-group">
      <label>Mot de passe</label>
      <input class="input" id="user-password" type="password" placeholder="Mot de passe">
    </div>`}
    <div class="form-group">
      <label>Rôle</label>
      <select class="input" id="user-role">
        <option value="user"${user && user.role === 'user' ? ' selected' : ''}>Utilisateur</option>
        <option value="admin"${user && user.role === 'admin' ? ' selected' : ''}>Administrateur</option>
      </select>
    </div>
  `;
  $('#modal-footer').innerHTML = `
    <button class="btn" id="modal-cancel">Annuler</button>
    <button class="btn btn-primary" id="modal-save">${editMode ? 'Enregistrer' : 'Ajouter'}</button>
  `;
  openModal();

  $('#modal-save').addEventListener('click', async () => {
    const username = $('#user-username').value.trim();
    const password = $('#user-password') ? $('#user-password').value : '';
    const email = $('#user-email').value.trim();
    if (!username) { alert('Le nom d\'utilisateur est requis'); return; }
    if (!editMode && !password) { alert('Le mot de passe est requis'); return; }

    const data = {
      nom: $('#user-nom').value,
      prenom: $('#user-prenom').value,
      username,
      email,
      role: $('#user-role').value,
    };
    if (password) data.password = password;

    try {
      if (editMode) {
        await API.updateUser(user.id, data);
      } else {
        await API.createUser(data);
      }
      closeModal();
      await loadAllEntities();
      renderSettingsTable();
    } catch (err) {
      alert('Erreur : ' + err.message);
    }
  });

  $('#modal-cancel').addEventListener('click', closeModal);

  const changePwdBtn = document.getElementById('user-change-pwd');
  if (changePwdBtn) {
    changePwdBtn.addEventListener('click', () => { closeModal(); openPasswordModal(user.id); });
  }
}

// ── Generic Entity Modal ──
async function openEntityModal(entityType, label, fieldDefs, item) {
  const editMode = !!item;

  // Load reference data for foreign keys
  if (['machines', 'outils', 'categories', 'os'].includes(entityType)) {
    await Promise.all([loadCategories(), loadMachines(), loadOutils(), loadOs(), loadFabriquants(), loadIcons()]);
  }

  const fieldInputs = fieldDefs.map(f => {
    let input;
    const val = item ? (item[f] !== null && item[f] !== undefined ? item[f] : '') : '';

    if (f === 'categorie_id') {
      input = html`
        <select class="input" id="entity-${f}">
          <option value="">-- Aucune --</option>
          ${state.categories.map(c => `<option value="${c.id}"${val == c.id ? ' selected' : ''}>${esc(c.nom)}</option>`).join('')}
        </select>`;
    } else if (f === 'os_id') {
      input = html`
        <select class="input" id="entity-${f}">
          <option value="">-- Aucun --</option>
          ${state.osList.map(o => `<option value="${o.id}"${val == o.id ? ' selected' : ''}>${esc(o.nom)}</option>`).join('')}
        </select>`;
    } else if (f === 'fabriquant_id') {
      input = html`
        <select class="input" id="entity-${f}">
          <option value="">-- Aucun --</option>
          ${state.fabriquants.map(fa => `<option value="${fa.id}"${val == fa.id ? ' selected' : ''}>${esc(fa.nom)} ${fa.modele ? esc(fa.modele) : ''}</option>`).join('')}
        </select>`;
    } else if (f === 'icon_id') {
      input = html`
        <select class="input" id="entity-${f}">
          <option value="">-- Aucune --</option>
          ${state.icons.map(i => `<option value="${i.id}"${val == i.id ? ' selected' : ''}>${esc(i.nom)} ${i.filename ? '(' + esc(i.filename) + ')' : ''}</option>`).join('')}
        </select>`;
    } else if (f === 'couleur') {
      input = html`<input class="input" id="entity-${f}" type="color" value="${val || '#58a6ff'}" style="height:42px;padding:.3rem">`;
    } else if (f === 'port') {
      input = html`<input class="input" id="entity-${f}" type="number" value="${val}" placeholder="ex: 8080" min="1" max="65535">`;
    } else if (entityType === 'icons' && f === 'entity_type') {
      const types = ['os', 'outil', 'category', 'machine', 'other'];
      input = html`
        <select class="input" id="entity-${f}">
          <option value="">-- Type --</option>
          ${types.map(t => `<option value="${t}"${val === t ? ' selected' : ''}>${t}</option>`).join('')}
        </select>`;
    } else if (entityType === 'icons' && f === 'data') {
      const iconUrl = item ? `/api/icons/${item.id}/file` : '';
      input = html`
        ${item ? `<img src="${iconUrl}" style="width:48px;height:48px;border-radius:8px;margin-bottom:.5rem;object-fit:cover" alt="current">` : ''}
        <input class="input" id="entity-data" type="file" accept=".svg" style="padding:.5rem">
        <div id="icon-preview" style="margin-top:.5rem;display:none"></div>
      `;
    } else {
      input = html`<input class="input" id="entity-${f}" value="${esc(String(val))}" placeholder="${esc(f)}">`;
    }

    const labelText = f.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    return html`<div class="form-group"><label>${esc(labelText)}</label>${input}</div>`;
  }).join('');

  $('#modal-title').textContent = editMode ? `Modifier ${label}` : `Ajouter ${label}`;
  $('#modal-body').innerHTML = fieldInputs;
  $('#modal-footer').innerHTML = `
    <button class="btn" id="modal-cancel">Annuler</button>
    <button class="btn btn-primary" id="modal-save">${editMode ? 'Enregistrer' : 'Ajouter'}</button>
  `;
  openModal();

  // ── Icons: file upload auto-fill + preview ──
  if (entityType === 'icons') {
    const fileInput = document.getElementById('entity-data');
    const nomInput = document.getElementById('entity-nom');
    const filenameInput = document.getElementById('entity-filename');

    if (nomInput) nomInput.addEventListener('input', () => nomInput.dataset.userEdited = '1');
    if (filenameInput) filenameInput.addEventListener('input', () => filenameInput.dataset.userEdited = '1');

    if (fileInput) {
      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (filenameInput && !filenameInput.dataset.userEdited) {
          filenameInput.value = file.name;
        }
        if (nomInput && !nomInput.dataset.userEdited) {
          nomInput.value = file.name.replace(/\.[^/.]+$/, '');
        }

        const content = await readFileAsText(file);
        const preview = document.getElementById('icon-preview');
        if (preview && content) {
          const blob = new Blob([content], { type: 'image/svg+xml' });
          const url = URL.createObjectURL(blob);
          preview.innerHTML = `<img src="${url}" style="width:48px;height:48px;border-radius:8px;object-fit:cover" alt="preview">`;
          preview.style.display = 'block';
        }
      });
    }
  }

  $('#modal-save').addEventListener('click', async () => {
    const data = {};
    for (const f of fieldDefs) {
      const el = $(`#entity-${f}`);
      if (!el) continue;
      let val;
      if (el.type === 'file') {
        const file = el.files[0];
        if (file) val = await readFileAsText(file);
        else continue;
      } else {
        val = el.value;
        if (el.type === 'number' || f.endsWith('_id')) val = val ? parseInt(val) : null;
        if (f === 'port') val = val ? parseInt(val) : null;
      }
      data[f] = val !== '' && val !== null ? val : null;
    }

    if (!editMode && entityType === 'icons' && !data.data) {
      alert('Veuillez sélectionner un fichier SVG pour l\'icône');
      return;
    }

    try {
      const apiMethods = {
        machines: editMode ? (id, d) => API.updateMachine(id, d) : (d) => API.createMachine(d),
        outils: editMode ? (id, d) => API.updateOutil(id, d) : (d) => API.createOutil(d),
        categories: editMode ? (id, d) => API.updateCategory(id, d) : (d) => API.createCategory(d),
        os: editMode ? (id, d) => API.updateOs(id, d) : (d) => API.createOs(d),
        fabriquants: editMode ? (id, d) => API.updateFabriquant(id, d) : (d) => API.createFabriquant(d),
        icons: editMode ? (id, d) => API.updateIcon(id, d) : (d) => API.createIcon(d),
      };
      const method = apiMethods[entityType];
      if (editMode) {
        await method(item.id, data);
      } else {
        await method(data);
      }
      closeModal();
      await loadAllEntities();

      if (editMode && (entityType === 'machines' || entityType === 'outils')) {
        const changed = [];
        for (const card of state.cards) {
          const match = entityType === 'machines' ? card.machine_id === item.id : card.outil_id === item.id;
          if (!match) continue;
          const machine = state.machines.find(m => m.id === card.machine_id);
          const outil = state.outils.find(o => o.id === card.outil_id);
          if (!machine || !outil) continue;

          const update = {};
          const newName = `${machine.nom} - ${outil.nom}`;
          if (newName !== card.nom) update.nom = newName;

          if (entityType === 'machines') {
            const newBaseUrl = machine.ip;
            if (newBaseUrl !== card.base_url) {
              update.base_url = newBaseUrl;
              update.url = buildUrl(card.prefix, newBaseUrl, outil.port || '', outil.main_page || '/');
            }
          }

          if (entityType === 'outils') {
            const baseForUrl = card.base_url || machine.ip;
            const newUrl = buildUrl(card.prefix, baseForUrl, outil.port || '', outil.main_page || '/');
            if (newUrl !== card.url) update.url = newUrl;
            if (outil.categorie_id !== card.categorie_id) update.categorie_id = outil.categorie_id;
          }

          if (Object.keys(update).length) {
            await API.updateCard(card.id, update);
            changed.push(card.id);
          }
        }
        if (changed.length) {
          await API.refreshHealth();
          await loadAllEntities();
          state.health = await API.health();
        }
      }

      await renderSettingsTable();
      if (state.view === 'dashboard') {
        await populateCategoryFilter();
        await refreshDashboard();
      }
    } catch (err) {
      alert('Erreur : ' + err.message);
    }
  });

  $('#modal-cancel').addEventListener('click', closeModal);
}

// ── Modal helpers ──
function openModal() {
  $('#overlay').classList.add('open');
  $('#modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  $('#overlay').classList.remove('open');
  $('#modal').classList.remove('open');
  document.body.style.overflow = '';
}

$('#modal-close').addEventListener('click', closeModal);
$('#overlay').addEventListener('click', closeModal);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

// ── Init ──
(async function init() {
  const token = localStorage.getItem('nh-token');
  if (token) {
    API._token = token;
    try {
      state.me = await API.me();
      await loadSettings();
      await refreshDashboard();
      showApp();
    } catch {
      showLogin();
    }
  } else {
    showLogin();
  }
  setInterval(async () => {
    if (state.view === 'dashboard') {
      await loadHealth();
      renderCards();
    }
  }, 30_000);
})();
